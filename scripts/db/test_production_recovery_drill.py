"""Fail-closed guards for the isolated production recovery drill (no credentials)."""
import os
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import production_recovery_drill as drill


class RecoveryDrillGuards(unittest.TestCase):
    def test_confirmation_precedes_any_process(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(drill.subprocess, 'run') as process:
            with self.assertRaisesRegex(RuntimeError, 'confirmation'):
                drill.main()
            process.assert_not_called()

    def test_snapshot_applies_to_one_dump_only(self):
        script = 'set -euo pipefail\npg_dump \\\n --schema-only\n'
        result = drill.with_snapshot(script, '00000002-00000042-1')
        self.assertIn('pg_dump --snapshot=00000002-00000042-1', result)
        for invalid in ('x; echo leak', '', '1-2-3\n'):
            with self.assertRaises(RuntimeError):
                drill.with_snapshot(script, invalid)
        for invalid in ('pg_dump --schema-only', script + script):
            with self.assertRaises(RuntimeError):
                drill.with_snapshot(invalid, '00000002-00000042-1')

    def test_post_data_constraints_follow_data_under_the_same_snapshot(self):
        script = 'pg_dump \\\n --schema-only\n'
        for section in ('pre-data', 'post-data'):
            result = drill.with_snapshot(script, '00000002-00000042-1', section)
            self.assertIn('--section=' + section, result)
            self.assertIn('--snapshot=00000002-00000042-1', result)
        self.assertLess(drill.BACKUP_PARTS.index('data'), drill.BACKUP_PARTS.index('schema-post'))
        with self.assertRaises(RuntimeError):
            drill.with_snapshot(script, '00000002-00000042-1', 'data; echo leak')

    def test_managed_schemas_and_acls_stay_in_the_same_export(self):
        script = '--exclude-schema "auth|storage|vault|cron"\nACL "auth|storage|vault|cron"'
        self.assertEqual(drill.include_managed_schema(script), '--exclude-schema "vault|cron"\nACL "vault|cron"')
        with self.assertRaises(RuntimeError):
            drill.include_managed_schema('--exclude-schema "vault|cron"')

    def test_managed_migration_rows_are_not_silently_omitted(self):
        script = ' --exclude-table "auth.schema_migrations" \\\n --exclude-table "storage.migrations" \\\n --exclude-table "supabase_functions.migrations" \\\n'
        result = drill.include_managed_migration_data(script)
        self.assertNotIn('auth.schema_migrations', result)
        self.assertNotIn('storage.migrations', result)
        self.assertIn('supabase_functions.migrations', result)
        with self.assertRaises(RuntimeError):
            drill.include_managed_migration_data(result)

    def test_offline_guard_rejects_networks_and_foreign_container(self):
        target = {'Name': '/' + drill.CONTAINER, 'NetworkSettings': {'Networks': {}}, 'HostConfig': {'NetworkMode': 'none'}}
        drill.require_offline(target)
        for changed in ({'Name': '/production'}, {'NetworkSettings': {'Networks': {'bridge': {}}}}, {'HostConfig': {'NetworkMode': 'host'}}, {'HostConfig': {'NetworkMode': 'container:foreign'}}):
            with self.assertRaises(RuntimeError):
                drill.require_offline(dict(target, **changed))

    def test_manifest_quotes_catalog_names_and_rejects_other_scopes(self):
        sql = drill.table_manifest_sql([{'schema': 'public', 'name': 'a"b', 'columns': ['x"y']}])
        self.assertIn('"public"."a""b"', sql)
        self.assertIn('"x""y"', sql)
        with self.assertRaises(RuntimeError):
            drill.table_manifest_sql([{'schema': 'vault', 'name': 'secrets', 'columns': ['secret']}])
        with self.assertRaises(RuntimeError):
            drill.table_manifest_sql([])

    @patch.object(drill.subprocess, 'run')
    def test_errors_emit_only_stage_exit_and_sqlstate(self, process):
        process.return_value = SimpleNamespace(returncode=1, stdout='', stderr='ERROR: 23505: private patient row and credential')
        with self.assertRaisesRegex(RuntimeError, r'^Restore failed \(exit 1\) SQLSTATE=23505$'):
            drill.run(['unused'], stage='Restore')

    def test_foreign_keys_respect_null_semantics(self):
        key = {'schema': 'public', 'table': 'child', 'parent_schema': 'auth',
               'parent_table': 'users', 'columns': ['a', 'b'], 'referenced': ['id', 'id2'], 'match': 's'}
        simple = drill.foreign_key_sql([key])
        self.assertIn('c."a" IS NOT NULL AND c."b" IS NOT NULL', simple)
        self.assertIn('NOT EXISTS (SELECT 1 FROM "auth"."users"', simple)
        full = drill.foreign_key_sql([dict(key, match='f')])
        self.assertIn('OR ((c."a" IS NOT NULL OR c."b" IS NOT NULL) AND NOT', full)
        with self.assertRaises(RuntimeError):
            drill.foreign_key_sql([dict(key, match='p')])
        with self.assertRaises(RuntimeError):
            drill.foreign_key_sql([dict(key, referenced=[])])

    def test_builtin_extension_namespace_is_never_recreated(self):
        for extension in ('pg_cron', 'plpgsql'):
            sql = drill.extension_setup_sql(extension, 'pg_catalog', '1.0')
            self.assertNotIn('CREATE SCHEMA', sql)
            self.assertIn('WITH SCHEMA "pg_catalog"', sql)
        self.assertIn('CREATE SCHEMA IF NOT EXISTS "extensions"', drill.extension_setup_sql('pgcrypto', 'extensions', '1.3'))

    def test_extension_dependency_installation_pins_source_version(self):
        sql = drill.extension_setup_sql('index_advisor', 'extensions', '0.2.0')
        self.assertIn("VERSION '0.2.0' CASCADE;", sql)

    def test_destination_image_pin_uses_verified_build(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            drill.pin_postgres_image(work)
            self.assertEqual((work / 'supabase' / '.temp' / 'postgres-version').read_text(), '17.6.1.084\n')

    @patch.object(drill, 'local_psql')
    def test_extension_preflight_rejects_schema_or_version_drift(self, query):
        query.return_value = '[["hypopg","extensions","1.4.1"]]'
        drill.verify_extensions([['hypopg', 'extensions', '1.4.1']])
        with self.assertRaises(RuntimeError):
            drill.verify_extensions([['hypopg', 'extensions', '1.4.2']])

    @patch.object(drill, 'run')
    def test_restore_can_only_address_fixed_local_container(self, process):
        process.return_value = ''
        drill.local_psql(files=('schema.sql', 'data.sql'))
        args = process.call_args.args[0]
        self.assertEqual(args[:6], ['docker', 'exec', '-i', '-e', 'PGPASSWORD=postgres', drill.CONTAINER])
        self.assertEqual(args[args.index('-h') + 1], '127.0.0.1')
        self.assertIn('--single-transaction', args)
        self.assertNotIn('--dbname', args)
        with patch.object(drill, 'CONTAINER', 'production'):
            with self.assertRaises(RuntimeError):
                drill.local_psql('DROP SCHEMA public CASCADE;')

    def test_permission_replay_removes_extra_access_and_preserves_grantor_options(self):
        wanted = {'schema':'public','name':'sample','kind':'r','owner':'postgres',
                  'grants':[['postgres','anon','SELECT',True]]}
        current = dict(wanted, grants=[['postgres','authenticated','INSERT',False]])
        sql, changed = drill.reconcile_table_acl_sql([wanted], [current])
        self.assertEqual(changed, 1)
        self.assertIn('REVOKE ALL PRIVILEGES ON TABLE "public"."sample" FROM "authenticated" CASCADE;', sql)
        self.assertIn('SET ROLE "postgres";', sql)
        self.assertIn('GRANT SELECT ON TABLE "public"."sample" TO "anon" WITH GRANT OPTION;', sql)
        self.assertEqual(drill.reconcile_table_acl_sql([wanted], [wanted])[1], 0)

    def test_permission_replay_rejects_foreign_inventory_or_unsupported_grant_chain(self):
        wanted = {'schema':'public','name':'sample','kind':'r','owner':'postgres',
                  'grants':[['postgres','anon','SELECT',False]]}
        with self.assertRaises(RuntimeError):
            drill.reconcile_table_acl_sql([wanted], [])
        with self.assertRaises(RuntimeError):
            drill.reconcile_table_acl_sql([dict(wanted,schema='pg_catalog')], [dict(wanted,schema='pg_catalog')])
        for grant in (['other','anon','SELECT',False],['postgres','anon','SELECT; DROP TABLE x',False]):
            with self.assertRaises(RuntimeError):
                drill.reconcile_table_acl_sql([dict(wanted,grants=[grant])], [wanted])


if __name__ == '__main__':
    unittest.main()
