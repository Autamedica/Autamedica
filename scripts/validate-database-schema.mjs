#!/usr/bin/env node
/**
 * Validador de sincronización entre esquema SQL y types TypeScript
 *
 * Este script:
 * 1. Analiza database/schema.sql para extraer estructura de tablas
 * 2. Compara con packages/types/src/supabase/database.types.ts
 * 3. Detecta discrepancias y sugiere actualizaciones
 * 4. Valida que todos los types estén documentados en el glosario
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Colores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Extrae información de tablas del schema SQL
 */
function parseSchemaSQL(schemaContent) {
  const tables = new Map();

  // Regex mejorado para capturar definiciones de tabla
  const tableRegex = /CREATE TABLE.*?public\.(\w+)\s*\(([\s\S]*?)\);/g;
  let match;

  while ((match = tableRegex.exec(schemaContent)) !== null) {
    const tableName = match[1];
    const tableDefinition = match[2];

    const columns = parseTableColumns(tableDefinition);
    tables.set(tableName, {
      name: tableName,
      columns: columns,
      constraints: parseConstraints(tableDefinition)
    });
  }

  return tables;
}

/**
 * Parsea columnas de una definición de tabla
 */
function parseTableColumns(definition) {
  const columns = [];
  const lines = definition.split('\n').map(line => line.trim()).filter(Boolean);

  for (const line of lines) {
    // Skip constraints, indices, etc.
    if (line.startsWith('PRIMARY KEY') ||
        line.startsWith('FOREIGN KEY') ||
        line.startsWith('CONSTRAINT') ||
        line.startsWith('CHECK') ||
        line.startsWith('UNIQUE')) {
      continue;
    }

    // Parse column definition
    const columnMatch = line.match(/^(\w+)\s+([^,\s]+(?:\s+[^,\s]+)*?)(?:\s+.*)?[,]?$/);
    if (columnMatch) {
      const [, name, type] = columnMatch;
      const isNullable = !line.includes('NOT NULL');
      const hasDefault = line.includes('DEFAULT');

      columns.push({
        name,
        type: normalizeDBType(type),
        nullable: isNullable,
        hasDefault
      });
    }
  }

  return columns;
}

/**
 * Normaliza tipos de PostgreSQL a tipos TypeScript equivalentes
 */
function normalizeDBType(dbType) {
  const typeMap = {
    'UUID': 'string',
    'VARCHAR': 'string',
    'TEXT': 'string',
    'INTEGER': 'number',
    'BIGINT': 'number',
    'DECIMAL': 'number',
    'NUMERIC': 'number',
    'BOOLEAN': 'boolean',
    'TIMESTAMP WITH TIME ZONE': 'string',
    'TIMESTAMPTZ': 'string',
    'DATE': 'string',
    'JSON': 'Json',
    'JSONB': 'Json'
  };

  const upperType = dbType.toUpperCase();

  // Handle arrays
  if (upperType.includes('[]')) {
    const baseType = upperType.replace('[]', '');
    return `${typeMap[baseType] || 'unknown'}[]`;
  }

  // Handle CHECK constraints with specific values
  if (upperType.includes('CHECK')) {
    // Para enums inline como CHECK (role IN ('patient', 'doctor', ...))
    const enumMatch = dbType.match(/CHECK\s*\([^)]*IN\s*\(([^)]+)\)/i);
    if (enumMatch) {
      const values = enumMatch[1].split(',').map(v => v.trim().replace(/'/g, ''));
      return values.map(v => `'${v}'`).join(' | ');
    }
  }

  return typeMap[upperType] || upperType.toLowerCase();
}

/**
 * Parsea constraints de la tabla
 */
function parseConstraints(definition) {
  const constraints = [];
  const lines = definition.split('\n').map(line => line.trim());

  for (const line of lines) {
    if (line.includes('PRIMARY KEY')) {
      constraints.push({ type: 'PRIMARY_KEY', definition: line });
    }
    if (line.includes('FOREIGN KEY') || line.includes('REFERENCES')) {
      constraints.push({ type: 'FOREIGN_KEY', definition: line });
    }
    if (line.includes('CHECK')) {
      constraints.push({ type: 'CHECK', definition: line });
    }
  }

  return constraints;
}

/**
 * Extrae estructura de database.types.ts
 */
function parseDatabaseTypes(typesContent) {
  const tables = new Map();

  const tablesStart = typesContent.indexOf('Tables: {');
  const viewsStart = typesContent.indexOf('Views: {', tablesStart);

  if (tablesStart === -1 || viewsStart === -1) {
    log('⚠️  No se encontró sección Tables en database.types.ts', 'yellow');
    return tables;
  }

  const tablesSection = typesContent.slice(tablesStart, viewsStart);
  const lines = tablesSection.split('\n');
  let currentTable = null;
  let collectingRow = false;
  let rowBraceDepth = 0;
  let rowLines = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const tableMatch = line.match(/^\s{6}(\w+):\s*{$/);

    if (!collectingRow && tableMatch) {
      currentTable = tableMatch[1];
      continue;
    }

    if (currentTable && !collectingRow && /^\s{8}Row:\s*{$/.test(line)) {
      collectingRow = true;
      rowBraceDepth = 1;
      rowLines = [];
      continue;
    }

    if (collectingRow) {
      const openCount = (line.match(/{/g) || []).length;
      const closeCount = (line.match(/}/g) || []).length;
      rowBraceDepth += openCount - closeCount;

      if (rowBraceDepth <= 0) {
        const rowDefinition = rowLines.join('\n');
        const columns = parseTypeScriptColumns(rowDefinition);
        tables.set(currentTable, {
          name: currentTable,
          columns
        });

        currentTable = null;
        collectingRow = false;
        rowLines = [];
        rowBraceDepth = 0;
      } else {
        rowLines.push(line);
      }
    }
  }

  return tables;
}

/**
 * Parsea columnas de definición TypeScript Row
 */
function parseTypeScriptColumns(rowDefinition) {
  const columns = [];
  const lines = rowDefinition.split('\n').map(line => line.trim()).filter(Boolean);

  for (const line of lines) {
    // Match: column_name: type | null
    const columnMatch = line.match(/^(\w+):\s*([^\/\n]+?)(?:\s*\/\/.*)?$/);
    if (columnMatch) {
      const [, name, typeDeclaration] = columnMatch;
      const isNullable = typeDeclaration.includes('| null');
      const cleanType = typeDeclaration.replace(/\s*\|\s*null/, '').trim();

      columns.push({
        name,
        type: cleanType,
        nullable: isNullable
      });
    }
  }

  return columns;
}

/**
 * Compara esquemas y detecta diferencias
 */
function compareSchemas(sqlTables, typeTables) {
  const issues = {
    missingTables: [],
    extraTables: [],
    columnMismatches: []
  };

  // Tablas faltantes en TypeScript
  for (const [tableName] of sqlTables) {
    if (!typeTables.has(tableName)) {
      issues.missingTables.push(tableName);
    }
  }

  // Tablas extra en TypeScript
  for (const [tableName] of typeTables) {
    if (!sqlTables.has(tableName)) {
      issues.extraTables.push(tableName);
    }
  }

  // Comparar columnas de tablas comunes
  for (const [tableName, sqlTable] of sqlTables) {
    if (typeTables.has(tableName)) {
      const typeTable = typeTables.get(tableName);
      const columnIssues = compareColumns(tableName, sqlTable.columns, typeTable.columns);
      if (columnIssues.length > 0) {
        issues.columnMismatches.push({
          table: tableName,
          issues: columnIssues
        });
      }
    }
  }

  return issues;
}

/**
 * Compara columnas entre SQL y TypeScript
 */
function compareColumns(tableName, sqlColumns, typeColumns) {
  const issues = [];
  const sqlColumnMap = new Map(sqlColumns.map(col => [col.name, col]));
  const typeColumnMap = new Map(typeColumns.map(col => [col.name, col]));

  // Columnas faltantes en TypeScript
  for (const [colName, sqlCol] of sqlColumnMap) {
    if (!typeColumnMap.has(colName)) {
      issues.push({
        type: 'MISSING_COLUMN',
        column: colName,
        expectedType: sqlCol.type,
        nullable: sqlCol.nullable
      });
    }
  }

  // Columnas extra en TypeScript
  for (const [colName] of typeColumnMap) {
    if (!sqlColumnMap.has(colName)) {
      issues.push({
        type: 'EXTRA_COLUMN',
        column: colName
      });
    }
  }

  // Tipos incompatibles
  for (const [colName, sqlCol] of sqlColumnMap) {
    if (typeColumnMap.has(colName)) {
      const typeCol = typeColumnMap.get(colName);

      // Verificar compatibilidad de tipos (básica)
      if (!areTypesCompatible(sqlCol.type, typeCol.type)) {
        issues.push({
          type: 'TYPE_MISMATCH',
          column: colName,
          sqlType: sqlCol.type,
          tsType: typeCol.type
        });
      }

      // Verificar nullability
      if (sqlCol.nullable !== typeCol.nullable) {
        issues.push({
          type: 'NULLABLE_MISMATCH',
          column: colName,
          sqlNullable: sqlCol.nullable,
          tsNullable: typeCol.nullable
        });
      }
    }
  }

  return issues;
}

/**
 * Verifica compatibilidad básica entre tipos SQL y TS
 */
function areTypesCompatible(sqlType, tsType) {
  // Normalizar y comparar tipos básicos
  const normalized = {
    'string': ['string', 'UUID', 'VARCHAR', 'TEXT'],
    'number': ['number', 'INTEGER', 'BIGINT', 'DECIMAL', 'NUMERIC'],
    'boolean': ['boolean', 'BOOLEAN'],
    'Json': ['Json', 'JSON', 'JSONB']
  };

  for (const [, types] of Object.entries(normalized)) {
    if (types.includes(sqlType) && types.includes(tsType)) {
      return true;
    }
  }

  // Enums y unions
  if (tsType.includes('|') && sqlType.includes('|')) {
    return true; // Aproximación básica para enums
  }

  return sqlType === tsType;
}

/**
 * Verifica documentación en glosario
 */
function checkGlosarioDocumentation() {
  try {
    const glosarioPath = join(rootDir, 'docs', 'GLOSARIO_MAESTRO.md');
    const glosario = readFileSync(glosarioPath, 'utf-8');

    const databaseSectionMatch = glosario.match(/## 📊 Database Schema([\s\S]*?)(?=##|$)/);

    return {
      hasSection: !!databaseSectionMatch,
      content: databaseSectionMatch ? databaseSectionMatch[1] : ''
    };
  } catch {
    return { hasSection: false, content: '' };
  }
}

/**
 * Función principal
 */
async function main() {
  log('🔍 Validando sincronización entre esquema SQL y tipos TypeScript...', 'cyan');

  // 1. Leer archivos
  const schemaPath = join(rootDir, 'docs', 'database', 'schema.sql');
  const typesPath = join(rootDir, 'packages', 'types', 'src', 'supabase', 'database.types.ts');

  if (!existsSync(schemaPath)) {
    log(`❌ No se encontró schema SQL en: ${schemaPath}`, 'red');
    process.exit(1);
  }

  if (!existsSync(typesPath)) {
    log(`❌ No se encontró database.types.ts en: ${typesPath}`, 'red');
    process.exit(1);
  }

  const schemaContent = readFileSync(schemaPath, 'utf-8');
  const typesContent = readFileSync(typesPath, 'utf-8');

  // 2. Parsear esquemas
  const sqlTables = parseSchemaSQL(schemaContent);
  const typeTables = parseDatabaseTypes(typesContent);

  log(`📊 Schema SQL: ${sqlTables.size} tablas encontradas`, 'blue');
  log(`📦 Types TS: ${typeTables.size} tablas encontradas`, 'blue');

  // Verificar salud del parser
  const parserHealthRatio = typeTables.size / sqlTables.size;
  if (parserHealthRatio < 0.9 && sqlTables.size > 0) {
    log(`⚠️  Salud del parser: ${Math.round(parserHealthRatio * 100)}% de tablas detectadas`, 'yellow');
    log(`💡 Posible ALTER TABLE o sintaxis no cubierta; considerar AST parser en next step`, 'yellow');
  }

  // Verificar salud de parsing de columnas
  let totalSqlColumns = 0;
  let totalTsColumns = 0;
  for (const [tableName, sqlTable] of sqlTables) {
    totalSqlColumns += sqlTable.columns.length;
    if (typeTables.has(tableName)) {
      totalTsColumns += typeTables.get(tableName).columns.length;
    }
  }

  const columnHealthRatio = totalSqlColumns > 0 ? totalTsColumns / totalSqlColumns : 1;
  if (columnHealthRatio < 0.9 && totalSqlColumns > 0) {
    log(`⚠️  Parsing de columnas: ${Math.round(columnHealthRatio * 100)}% detectadas (${totalTsColumns}/${totalSqlColumns})`, 'yellow');
    log(`💡 Revisar constraints complejos o sintaxis no cubierta en parsing`, 'yellow');
  }

  // 3. Comparar esquemas
  const issues = compareSchemas(sqlTables, typeTables);

  // 4. Verificar documentación
  const glossaryCheck = checkGlosarioDocumentation();

  // 5. Generar reporte
  log('\n📋 REPORTE DE VALIDACIÓN DE ESQUEMA', 'bright');
  log('=' .repeat(50), 'blue');

  let hasErrors = false;

  if (issues.missingTables.length > 0) {
    log(`\n❌ TABLAS FALTANTES EN TYPESCRIPT (${issues.missingTables.length}):`, 'red');
    for (const table of issues.missingTables) {
      log(`   - ${table}`, 'red');
    }
    hasErrors = true;
  }

  if (issues.extraTables.length > 0) {
    log(`\n⚠️  TABLAS EXTRA EN TYPESCRIPT (${issues.extraTables.length}):`, 'yellow');
    for (const table of issues.extraTables) {
      log(`   - ${table}`, 'yellow');
    }
  }

  if (issues.columnMismatches.length > 0) {
    log(`\n🔄 DISCREPANCIAS EN COLUMNAS (${issues.columnMismatches.length} tablas):`, 'yellow');
    for (const mismatch of issues.columnMismatches) {
      log(`\n   📋 Tabla: ${mismatch.table}`, 'cyan');
      for (const issue of mismatch.issues) {
        switch (issue.type) {
          case 'MISSING_COLUMN':
            log(`     ❌ Columna faltante: ${issue.column} (${issue.expectedType})`, 'red');
            hasErrors = true;
            break;
          case 'EXTRA_COLUMN':
            log(`     ⚠️  Columna extra: ${issue.column}`, 'yellow');
            break;
          case 'TYPE_MISMATCH':
            log(`     🔄 Tipo incompatible: ${issue.column} (SQL: ${issue.sqlType}, TS: ${issue.tsType})`, 'yellow');
            break;
          case 'NULLABLE_MISMATCH':
            log(`     🔄 Nullability: ${issue.column} (SQL: ${issue.sqlNullable}, TS: ${issue.tsNullable})`, 'yellow');
            break;
        }
      }
    }
  }

  // Documentación
  if (!glossaryCheck.hasSection) {
    log(`\n📚 DOCUMENTACIÓN FALTANTE:`, 'yellow');
    log(`   ⚠️  No se encontró sección "Database Schema" en GLOSARIO_MAESTRO.md`, 'yellow');
    log(`   💡 Agregar documentación del esquema de base de datos`, 'cyan');
  } else {
    log(`\n✅ Documentación encontrada en glosario`, 'green');
  }

  // Resumen final
  if (hasErrors) {
    log(`\n❌ VALIDACIÓN FALLIDA - Se encontraron errores críticos`, 'red');
    log(`\n🔧 ACCIONES RECOMENDADAS:`, 'cyan');
    log(`   1. Ejecutar: supabase gen types typescript --local > packages/types/src/supabase/database.types.ts`, 'yellow');
    log(`   2. Verificar sincronización con: pnpm db:validate`, 'yellow');
    log(`   3. Actualizar documentación en GLOSARIO_MAESTRO.md`, 'yellow');
    process.exit(1);
  } else if (issues.extraTables.length > 0 || issues.columnMismatches.length > 0) {
    log(`\n⚠️  VALIDACIÓN CON WARNINGS - Revisar discrepancias menores`, 'yellow');
    process.exit(0);
  } else {
    log(`\n🎉 ¡ESQUEMA COMPLETAMENTE SINCRONIZADO!`, 'green');
    log(`📊 ${sqlTables.size} tablas validadas correctamente`, 'green');
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    log(`💥 Error: ${error.message}`, 'red');
    process.exit(1);
  });
}

export { main as validateDatabaseSchema };
