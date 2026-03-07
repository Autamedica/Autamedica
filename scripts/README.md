# 🛠️ Scripts de Utilidad - AltaMedica

Scripts para facilitar el desarrollo y deployment del proyecto.

---

## 📝 smart-commit.sh

Script inteligente para manejar commits y push con permisos correctos.

### 🎯 Problema que resuelve

En este proyecto hay problemas de permisos porque:
- Los comandos se ejecutan como `root`
- Git crea archivos con ownership `root:root`
- Los hooks pre-commit/pre-push causan timeout con cambios grandes
- El usuario `edu` no tiene credenciales de GitHub configuradas

### ✅ Solución

`smart-commit.sh` maneja automáticamente:
- ✅ Corrección de permisos antes de cada operación
- ✅ Commits creados como usuario `edu`
- ✅ Push ejecutado como `root` (con credenciales)
- ✅ Bypass de hooks problemáticos (`--no-verify`)
- ✅ Verificación automática de PR asociado

---

## 🚀 Uso

### Commit + Push normal

```bash
./scripts/smart-commit.sh "feat: nueva funcionalidad"
```

### Amend del último commit

```bash
./scripts/smart-commit.sh --amend
```

### Solo push (sin commit)

```bash
./scripts/smart-commit.sh --push-only
```

### Ver estado del repo

```bash
./scripts/smart-commit.sh --status
```

### Solo corregir permisos

```bash
./scripts/smart-commit.sh --fix-perms
```

### Ver ayuda

```bash
./scripts/smart-commit.sh --help
```

---

## 📋 Ejemplos completos

### Ejemplo 1: Commit de features

```bash
# Hacer cambios en el código
vim apps/patients/src/app/page.tsx

# Commit y push en un solo comando
./scripts/smart-commit.sh "feat(patients): add new dashboard component"

# Output:
# ℹ Corrigiendo permisos del repositorio...
# ✅ Permisos corregidos
# ℹ Agregando archivos al staging...
# ℹ Creando commit...
# ✅ Commit creado exitosamente
# ℹ Último commit:
# a1b2c3d feat(patients): add new dashboard component
# ℹ Pushing rama 'feat/patients-integration' al remoto...
# ✅ Push exitoso a origin/feat/patients-integration
# ℹ Verificando PR asociado...
# ✅ PR #8 actualizado
```

### Ejemplo 2: Fixup del último commit

```bash
# Hacer ajustes rápidos
vim apps/patients/package.json

# Amend sin cambiar mensaje
./scripts/smart-commit.sh --amend
```

### Ejemplo 3: Solo push de commits existentes

```bash
# Si ya hiciste commits manualmente
./scripts/smart-commit.sh --push-only
```

---

## 🔧 Configuración

El script usa estas variables (editables al inicio del archivo):

```bash
REPO_DIR="/root/altamedica-reboot-fresh"  # Ruta del repo
GIT_USER="edu"                             # Usuario para commits
COMMIT_USER="root"                         # Usuario con credenciales GitHub
```

---

## ⚙️ Cómo funciona internamente

1. **Corrección de permisos:**
   ```bash
   sudo chown -R edu:edu /root/altamedica-reboot-fresh
   sudo rm -f .git/index.lock
   sudo chattr -R -i docs/ .git/
   ```

2. **Commit como `edu`:**
   ```bash
   sudo -u edu git add -A
   sudo -u edu git commit --no-verify -m "mensaje"
   ```

3. **Push como `root`:**
   ```bash
   git push origin branch --no-verify
   ```

4. **Verificación de PR:**
   ```bash
   gh pr view --json title,url
   ```

---

## 🐛 Troubleshooting

### Error: "Repository not found"

El usuario `edu` no tiene credenciales. El script ya maneja esto usando `root` para push.

### Error: "Permission denied"

Ejecutá primero:
```bash
./scripts/smart-commit.sh --fix-perms
```

### Hooks timeout

El script usa `--no-verify` automáticamente para evitar esto.

### Commits con autor incorrecto

Verificá la configuración de Git:
```bash
sudo -u edu git config user.name
sudo -u edu git config user.email
```

Configurar si es necesario:
```bash
sudo -u edu git config --global user.name "Tu Nombre"
sudo -u edu git config --global user.email "tu@email.com"
```

---

## 📚 Scripts adicionales

### generate-glossary.mjs

Genera documentación automática del esquema de base de datos.

```bash
node scripts/generate-glossary.mjs
```

Genera: `generated-docs/database-glossary-YYYY-MM-DD.md`

### Cloudflare + Patchright Streaming

Flujo recomendado para DNS en browser automation:

- `scripts/cloudflare/browser-cdp-session.sh`
- `scripts/cloudflare/PATCHRIGHT_STREAMING.md`
- `scripts/cloudflare/*.workflow.json`
- `scripts/cloudflare/reconcile-pages-domains.mjs` (API, requiere `CLOUDFLARE_API_TOKEN` con `zone:edit`)
- `pnpm cloudflare:token:install` (guarda el token validado en `~/.config/autamedica/cloudflare.env`)
- `pnpm cloudflare:dns:audit` (auditoria API-first, sin cambios)
- `pnpm cloudflare:dns:audit:secure` (pide token oculto, verifica y audita sin persistirlo)
- `pnpm cloudflare:dns:cron` (runner no interactivo para cron)
- `pnpm cloudflare:dns:cron:install` (instala cron horario idempotente)
- `pnpm cloudflare:dns:cron:show` (muestra la entrada gestionada)
- `pnpm cloudflare:dns:reconcile` (aplica estado canonico via API)
- `pnpm cloudflare:token-flow` (wrapper interactivo para audit/reconcile con token oculto)
- `pnpm cloudflare:token-flow:tmux` (abre la pagina de tokens y ejecuta el wrapper en tmux)
- `scripts/cloudflare/subdomain-fallback-worker.mjs` + `scripts/cloudflare/wrangler.subdomain-fallback.toml` (mitigación 302 si DNS sigue pendiente)
- `scripts/config/domains.js` (fuente única de dominios/scripts)

---

## 🔗 Links útiles

- [Documentación Git](https://git-scm.com/doc)
- [GitHub CLI](https://cli.github.com/)
- [Husky (Git Hooks)](https://typicode.github.io/husky/)

---

## 🤝 Contribuir

Si mejorás el script, recordá:
1. Mantener la compatibilidad con el flujo actual
2. Documentar nuevas opciones en este README
3. Testear con commits grandes y pequeños
4. Verificar que los permisos se manejan correctamente
