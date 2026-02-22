# AutaMedica Claude Code Agents

## 🤖 Sistema de Agentes Automático

Este proyecto incluye 6 agentes especializados que se registran automáticamente en Claude Code.

### 📋 Agentes Disponibles

#### 1. **agent_code** (Prioridad 1)

- **Timeout**: 180 minutos
- **Responsabilidades**:
  - Pre-commit emulation (lint, vitest)
  - Pre-push emulation (typecheck, build)
  - Router validation (App Router only)
  - Cleanup duplicates
- **Tools**: Read, Write, Edit, Bash, Grep, Glob

#### 2. **agent_db** (Prioridad 2)

- **Timeout**: 180 minutos
- **Responsabilidades**:
  - Fetch DB credentials via MCP
  - DB snapshot before changes
  - Run migrations
  - Validate RLS policies
- **Tools**: Read, Write, Bash, Grep

#### 3. **agent_security** (Prioridad 3)

- **Timeout**: 120 minutos
- **Responsabilidades**:
  - Enforce security headers (HSTS, CSP, etc.)
  - Node fetch checks
  - Screenshot validation
- **Tools**: Read, Bash, Grep, Glob, Playwright

#### 4. **agent_dns_deploy** (Prioridad 4)

- **Timeout**: 90 minutos
- **Responsabilidades**:
  - Build and deploy to Cloudflare Pages
  - Validate headers in production
  - Post-deployment screenshots
- **Tools**: Read, Bash, Grep

#### 5. **agent_qa** (Prioridad 5)

- **Timeout**: 60 minutos
- **Responsabilidades**:
  - Final mandatory tests
  - Full system validation
- **Tools**: Read, Bash, Grep, Glob, Playwright

#### 6. **agent_docs** (Prioridad 6)

- **Timeout**: 20 minutos
- **Responsabilidades**:
  - Auto-commit generated docs
  - Update README and logs
- **Tools**: Read, Write, Edit, Bash

---

## 🚀 Comandos Rápidos

### Registrar Agentes

```bash
pnpm agents:register
```

### Listar Agentes

```bash
pnpm agents:list
```

### Ver Configuración de un Agente

```bash
cat ~/.claude/agents/agent_code.md
```

---

## 🔧 Configuración

La configuración de agentes se encuentra en:

- **Source**: `/root/.claude/agentic-config.json`
- **Claude Agents**: `~/.claude/agents/` (model: sonnet)
- **OpenAI/ChatGPT Agents**: `~/.openai/agents/` (model: gpt-5)
- **Registration Scripts**: `scripts/register-claude-agents.mjs` y `scripts/register-openai-agents.mjs`

### Modificar Agentes

1. Edita `/root/.claude/agentic-config.json`
2. Ejecuta `pnpm agents:register`
3. Se generarán agentes para Claude y ChatGPT/OpenAI (mismos prompts, tools, prioridades, timeouts)

---

## 💡 Uso en Claude Code / ChatGPT

Una vez registrados, los agentes están disponibles automáticamente en Claude Code y como perfiles locales para ChatGPT/OpenAI:

### Invocación Automática (Claude)

Claude Code detectará automáticamente cuándo usar cada agente basándose en tu solicitud:

```
Usuario: "Need to run security checks"
Claude Code: *Automatically invokes agent_security*
```

### Invocación Explícita (Claude)

También puedes solicitar un agente específico:

```
Usuario: "Use agent_code to validate the codebase"
Claude Code: *Uses Task tool with agent_code*
```

---

## 📊 Flujo de Trabajo Agéntico

El sistema sigue el workflow definido en `.github/workflows/autamedica-agentic.yml`:

1. **agent_code** → Validación de código
2. **agent_db** → Gestión de base de datos (paralelo con code)
3. **agent_security** → Validación de seguridad (después de code)
4. **agent_dns_deploy** → Deployment (después de security)
5. **agent_qa** → QA final (después de todos)
6. **agent_docs** → Documentación (después de QA)

---

## 🎯 Ventajas del Sistema

- ✅ **Automatización Total**: No necesitas seleccionar agentes manualmente
- ✅ **Sincronización**: Siempre en sync con `agentic-config.json`
- ✅ **Especialización**: Cada agente con herramientas específicas
- ✅ **Prioridades**: Sistema de prioridades definido
- ✅ **Timeouts**: Límites de tiempo configurados
- ✅ **Tools Restringidos**: Cada agente solo accede a las herramientas necesarias

---

## 🔄 Sincronización con GitHub Actions

Los agentes locales de Claude Code están sincronizados con el workflow de GitHub Actions:

- **Local**: `~/.claude/agents/` + Claude Code Task tool
- **CI/CD**: `.github/workflows/autamedica-agentic.yml`
- **Config**: `/root/.claude/agentic-config.json` (fuente de verdad)

Esto permite desarrollo local con los mismos agentes que corren en CI/CD.

---

## 📝 Ejemplo de Uso Completo

```bash
# 1. Registrar agentes (una sola vez, o cuando cambies config)
pnpm agents:register

# 2. Iniciar Claude Code
claude

# 3. Solicitar tarea (Claude usará agentes automáticamente)
> "I need a full security audit of the codebase"
# Claude Code invocará agent_security automáticamente

# 4. Ver logs de agentes
pnpm agents:list
cat ~/.claude/agents/agent_security.md
```

---

## 🛠️ Troubleshooting

### Agentes no aparecen

```bash
# Re-registrar agentes
pnpm agents:register

# Verificar que se crearon
ls -lah ~/.claude/agents/
```

### Modificar comportamiento de un agente

```bash
# Editar directamente el archivo
nano ~/.claude/agents/agent_code.md

# O modificar config y re-registrar
nano /root/.claude/agentic-config.json
pnpm agents:register
```

### Ver herramientas disponibles para un agente

```bash
cat ~/.claude/agents/agent_code.md | grep "tools:"
```

---

## 🔄 Sistema de Sincronización Automática

### **Nuevos Comandos Disponibles:**

```bash
pnpm agents:register   # Sincronizar agentes manualmente
pnpm agents:list       # Listar agentes registrados
pnpm agents:watch      # Watch mode para desarrollo activo
```

### **Git Hooks Automáticos:**

Los agentes se sincronizan automáticamente con Git:

- ✅ **post-merge**: Después de `git pull` o `git merge`
- ✅ **post-checkout**: Después de `git checkout <branch>`

**Ver guía completa:** [docs/AGENTS_SYNC_GUIDE.md](docs/AGENTS_SYNC_GUIDE.md)

---

**Última actualización**: 2025-10-06
**Versión**: 2.0.0 (con sincronización automática)

### Uso con ChatGPT/OpenAI

- Los agentes equivalentes se guardan en `~/.openai/agents/*.md`.
- Puedes reutilizar el contenido como System Prompt o como plantilla de “Custom Instructions”.
- Por defecto usan `model: gpt-5` y establecen `autonomy: high` con una política de decisión: ejecutar lint/typecheck y refactors seguros, pedir aprobación para acciones destructivas.
