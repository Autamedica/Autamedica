# CI local en Windows y runners autohospedados de GitHub

Esta guía documenta el patrón que usamos en AutaMedica para mantener validaciones disponibles cuando GitHub Actions no consigue iniciar jobs. Separa dos herramientas que suelen confundirse:

1. **Runner autohospedado de GitHub:** recibe jobs de workflows y los ejecuta en una máquina Windows propia.
2. **CI local de PowerShell:** ejecuta directamente en Windows una parte de las validaciones del repositorio, sin depender de que GitHub Actions despache un job.

Ninguna de las dos herramientas repara por sí sola un problema interno del servicio de GitHub Actions. La guía ayuda a identificar en qué capa está el fallo y evita reinstalar el runner cuando el problema sucede antes de que exista un job.

## 1. Elegir el modo correcto

| Señal | Interpretación | Acción |
| --- | --- | --- |
| Runner aparece **Online** y un job se ejecuta | El runner recibe y ejecuta trabajos | Usar workflows restringidos a ese runner |
| Run queda `queued`, existe un job y no tiene runner asignado | El scheduler tiene un job, pero no encuentra un runner compatible | Revisar estado Online, etiquetas, grupo y permisos del runner |
| Run termina en `startup_failure` y la API devuelve `jobs: []` | GitHub no llegó a crear/asignar un job | Revisar workflow ID/path, estado de Actions y escalar a GitHub Support si afecta workflows válidos |
| Un job inicia y luego falla | El runner sí recibió el trabajo | Revisar logs del job y logs locales del runner |
| GitHub Actions no despacha jobs | El agente local no puede recibir nada | Ejecutar las validaciones disponibles con `scripts/ci-local.ps1` |

**Regla de diagnóstico:** un `startup_failure` con cero jobs no demuestra que el runner Windows esté desconectado. El runner no puede ejecutar ni registrar un job que GitHub nunca creó.

## 2. Configurar un runner Windows autohospedado

### Requisitos

- Acceso de administrador al repositorio (o a la organización, según el ámbito donde se registre el runner).
- Una máquina Windows x64 encendida y con acceso HTTPS saliente a GitHub.
- Una cuenta de Windows dedicada a la ejecución, sin privilegios administrativos durante los jobs siempre que sea posible.
- Un workflow de prueba que no maneje secretos ni datos clínicos.

### Registro seguro

1. Abrir el repositorio en GitHub.
2. Ir a **Settings → Actions → Runners → New self-hosted runner**.
3. Elegir **Windows** y **x64**.
4. Seguir los comandos de instalación que GitHub muestra para ese repositorio. Esos comandos contienen un token temporal de registro: usarlo solo en esa máquina y no guardarlo en el repositorio, en logs, en tickets ni en el historial compartido.
5. Durante la configuración en Windows, elegir la instalación como servicio cuando se necesite que el runner arranque con el equipo. Para configurar el servicio en Windows hay que usar una terminal elevada.
6. Confirmar que aparece como **Online** en Settings → Actions → Runners.

No copies un token de registro antiguo: vuelve a generar las instrucciones desde la pantalla del repositorio. El token tiene una vida limitada.

### Verificación local

Abrir PowerShell en la máquina runner:

```powershell
# Ver los servicios registrados del runner.
Get-Service -Name 'actions.runner.*' -ErrorAction SilentlyContinue |
  Select-Object Name, Status, StartType

# Ver cuántos listeners están ejecutándose.
Get-CimInstance Win32_Process -Filter "Name='Runner.Listener.exe'" |
  Select-Object ProcessId, ExecutablePath

# Revisar el log de diagnóstico más reciente.
$RunnerDirectory = Join-Path $env:USERPROFILE 'actions-runner'
$LatestRunnerLog = Get-ChildItem (Join-Path $RunnerDirectory '_diag') -Filter 'Runner_*.log' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($LatestRunnerLog) {
  Get-Content -LiteralPath $LatestRunnerLog.FullName -Tail 60
}
```

Ajusta `$RunnerDirectory` si instalaste el runner en otra carpeta.

**No inicies una segunda copia de `Runner.Listener.exe` con el mismo registro/nombre.** Si ya existe una instancia como servicio, usa ese servicio. El error `Conflict` suele indicar que otra sesión del mismo runner ya está conectada. No borres la configuración para resolverlo: identifica primero la instancia activa.

Para iniciar o detener el servicio ya configurado:

```powershell
Get-Service -Name 'actions.runner.*'
Start-Service -Name 'actions.runner.*'
Stop-Service -Name 'actions.runner.*'
```

Si no se configuró como servicio, el proceso interactivo se inicia desde el directorio del runner con `.\run.cmd`. No ejecutes `run.cmd` al mismo tiempo que el servicio.

### Workflow de prueba aislado

Usa un job manual y sin secretos:

```yaml
name: Self-hosted runner smoke test

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify:
    runs-on: [self-hosted, Windows, X64]
    timeout-minutes: 3
    steps:
      - name: Verify runner
        shell: powershell
        run: |
          Write-Host "Runner: $env:GITHUB_RUNNER_NAME"
          Write-Host "OS: $env:GITHUB_RUNNER_OS"
          Write-Host "Architecture: $env:GITHUB_RUNNER_ARCH"
          if ($env:GITHUB_RUNNER_OS -ne "Windows") {
            throw "Expected a Windows runner"
          }
          Write-Host "SELF-HOSTED RUNNER SMOKE TEST PASSED"
```

En AutaMedica existe `.github/workflows/self-hosted-runner-smoke.yml`, que además valida el nombre `autamedica-win10-local-01`. Se dispara manualmente desde **Actions → Self-hosted Runner Smoke Test → Run workflow**. Un resultado válido debe mostrar un job completado y el nombre del runner en sus detalles; que el proceso local muestre `Listening for Jobs` no basta para declarar la prueba aprobada.

## 3. Ejecutar CI local cuando GitHub no despacha jobs

El script `scripts/ci-local.ps1` es el fallback para validar localmente los controles que pueden ejecutarse en Windows.

Desde la raíz del repositorio:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/ci-local.ps1
```

El script:
- identifica el commit, rama, sistema y herramientas disponibles;
- ejecuta las pruebas Node autocontenidas y los controles compatibles con el entorno;
- ejecuta los checks de monorepo cuando las dependencias y versiones requeridas están disponibles;
- marca como `blocked` los checks que necesitan herramientas/servicios ausentes (por ejemplo, Deno, Bash, Docker o Supabase local);
- guarda log y reporte JSON en `%LOCALAPPDATA%\Autamedica\ci-local`;
- evita registrar variables de entorno sensibles y aplica redacción a patrones comunes de credenciales.

Códigos de salida:

| Código | Significado |
| ---: | --- |
| `0` | Todas las comprobaciones disponibles finalizaron correctamente |
| `1` | Al menos una comprobación ejecutada falló |
| `2` | No hubo fallos en las comprobaciones ejecutadas, pero faltan herramientas o precondiciones para completar todos los gates |

Un código `2` **no significa CI completamente aprobado**. Lee el JSON: distingue checks `passed`, `failed`, `blocked` y `not_run`. La validación local tampoco sustituye pruebas Linux, Deno, Docker/Supabase, integración externa ni despliegues.

La versión fijada por el CI del proyecto debe respetarse. En la configuración documentada para AutaMedica, el script comprueba Node 22 y pnpm 9.15.2; una diferencia de versiones se informa como bloqueo, no se oculta.

## 4. Diagnosticar GitHub Actions antes de tocar el runner

Para una ejecución concreta:

```bash
gh run view RUN_ID --repo OWNER/REPO --json name,workflowName,status,conclusion,jobs
gh api repos/OWNER/REPO/actions/runs/RUN_ID/jobs
```

Comprueba el `workflow_id`, `path`, `conclusion` y la lista de jobs.

- **`jobs: []` + `startup_failure`:** el fallo ocurrió antes de asignar un job. Cambiar etiquetas, reinstalar el runner o lanzar otra instancia no corrige esa etapa. Guarda el ID de ejecución, workflow ID, path, hora UTC y respuesta de jobs; abre un caso con GitHub Support si afecta workflows válidos.
- **Job en cola sin runner:** revisa que el runner esté Online, que las etiquetas de `runs-on` coincidan y que el repositorio tenga permiso para usar ese runner/grupo.
- **Job con runner asignado y fallo durante un step:** inspecciona los logs del job y el directorio `_diag` de la máquina.

En este repositorio, el 11 de noviembre de 2026 observamos ejecuciones `startup_failure` sin jobs tanto para el workflow huérfano `BuildFailed` (workflow ID `240241003`) como para workflows independientes válidos: el smoke test Windows (workflow ID `414524609`) y el test mínimo alojado (workflow ID `256454858`). Esto apunta a un fallo anterior a la asignación del runner; no confirma por sí solo la causa interna de GitHub.

No hagas limpieza masiva de runs, no borres/recrees workflows válidos, no desactives y reactives Actions ni cambies la rama principal como experimento rutinario. Conserva la evidencia y pide a GitHub que inspeccione cualquier registro huérfano desde su backend.

## 5. Seguridad: límites obligatorios de un runner persistente

Un runner autohospedado no es una VM limpia y efímera. El código ejecutado puede persistir cambios y afectar archivos, procesos o credenciales disponibles en esa máquina.

- No uses un runner persistente para ejecutar código no confiable de PRs externos o forks.
- Mantén el canary en `workflow_dispatch` y usa solo jobs de repositorios/cambios confiables.
- No descargues ni ejecutes artefactos aportados por workflows no confiables en el mismo runner que tenga acceso a secretos.
- Usa permisos mínimos, evita secretos en variables globales y no imprimas el entorno completo.
- Limita el acceso del runner al repositorio y desregístralo desde GitHub antes de retirar o reutilizar la máquina.

## 6. Costos y límites

La documentación de GitHub indica que el uso de runners autohospedados no consume minutos de runner hospedado de GitHub. El almacenamiento de artefactos/cachés y otros productos o proveedores siguen sujetos a sus propias cuotas y tarifas; revisa la facturación del plan antes de asumir que todo el pipeline es gratuito.

## 7. Antecedentes verificables de AutaMedica

El repositorio ya utilizó `runs-on: self-hosted` y revirtió cambios a runners hospedados cuando el grupo/organización no asignaba máquinas:
- [Cambio a runners autohospedados](https://github.com/ecucondorSA/Autamedica/commit/2b6789424491dba5da40dff344de289a20738eeb)
- [Reversión a self-hosted tras fallos de asignación](https://github.com/ecucondorSA/Autamedica/commit/60bed456f52986ebad8563bdf042829e03fdad78)
- [Consolidación de CI/CD y runner canary](https://github.com/ecucondorSA/Autamedica/commit/0af6b6bf6afd86c3129be17602383811f85bb1f3)

La decisión actual es conservar dos caminos complementarios: el runner autohospedado para jobs confiables cuando GitHub los despacha, y el script local para no perder toda la validación cuando el despacho remoto está bloqueado.

## Referencias oficiales
- [Agregar runners autohospedados](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
- [Configurar el runner como servicio en Windows](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application?platform=windows)
- [Uso seguro de runners autohospedados](https://docs.github.com/en/actions/reference/security/secure-use)
- [Facturación y uso de GitHub Actions](https://docs.github.com/en/actions/concepts/billing-and-usage)
