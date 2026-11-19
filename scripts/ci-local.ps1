<#
Run from the repository root with:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/ci-local.ps1

Exit codes: 0 = all available checks passed; 1 = a check failed; 2 = checks were blocked by missing tools or prerequisites.
Logs and the JSON result are written under the current user's LocalAppData\Autamedica\ci-local directory.
#>
[CmdletBinding()]
param(
    [string]$LogDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runStarted = [DateTime]::UtcNow
$runId = $runStarted.ToString('yyyyMMddTHHmmssZ')

function Find-ExecutablePath {
    param([string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $command) { return '' }
    return [string]$command.Source
}

$gitExe = Find-ExecutablePath 'git.exe'
$nodeExe = Find-ExecutablePath 'node.exe'
$pnpmCmd = Find-ExecutablePath 'pnpm.cmd'
$pythonExe = Find-ExecutablePath 'python.exe'
$bashExe = Find-ExecutablePath 'bash.exe'
$denoExe = Find-ExecutablePath 'deno.exe'
$dockerExe = Find-ExecutablePath 'docker.exe'
$supabaseExe = Find-ExecutablePath 'supabase.exe'
$psqlExe = Find-ExecutablePath 'psql.exe'
$rgExe = Find-ExecutablePath 'rg.exe'

if ([string]::IsNullOrWhiteSpace($LogDirectory)) {
    $localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    if ([string]::IsNullOrWhiteSpace($localAppData)) {
        $localAppData = $env:TEMP
    }
    $LogDirectory = Join-Path $localAppData 'Autamedica\ci-local'
}
if (-not [IO.Path]::IsPathRooted($LogDirectory)) {
    $LogDirectory = Join-Path $repoRoot $LogDirectory
}
New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
$logPath = Join-Path $LogDirectory ("ci-local-{0}.log" -f $runId)
$reportPath = Join-Path $LogDirectory ("ci-local-{0}.json" -f $runId)
$script:LogPath = $logPath
$script:Checks = New-Object 'System.Collections.Generic.List[object]'
$script:FailureSeen = $false
$script:SensitiveEnvironment = '(?i)(TOKEN|SECRET|PASSWORD|PRIVATE|CREDENTIAL|API[_-]?KEY|SERVICE[_-]?ROLE|(?:SUPABASE_)?DATABASE_URL|SUPABASE_DB_URL)'
$script:LastCommandOutput = @()

function Protect-LogText {
    param([AllowNull()][string]$Text)
    if ($null -eq $Text) { return '' }
    $safe = $Text
    $safe = [regex]::Replace($safe, '(?i)\b(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(?:live|test)_[A-Za-z0-9]{12,}|sb_secret_[A-Za-z0-9_-]{12,}|sbp_[A-Za-z0-9]{20,})\b', '[REDACTED]')
    $safe = [regex]::Replace($safe, '\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b', '[REDACTED-JWT]')
    $safe = [regex]::Replace($safe, '(?i)(Bearer\s+)[A-Za-z0-9._~+/=-]+', '$1[REDACTED]')
    $safe = [regex]::Replace($safe, '(?i)(postgres(?:ql)?://[^:/\s]+:)[^@\s/]+@', '$1[REDACTED]@')
    $safe = [regex]::Replace($safe, '(?i)(\b[A-Z0-9_.-]*(?:token|secret|password|api[_-]?key|_key|credential|database_url|db_url)\s*[:=]\s*)[^\s,;]+', '$1[REDACTED]')
    return $safe
}

function Write-RunLog {
    param([string]$Message)
    $line = '{0} {1}' -f [DateTime]::UtcNow.ToString('o'), (Protect-LogText $Message)
    Add-Content -LiteralPath $script:LogPath -Value $line -Encoding UTF8
    [Console]::WriteLine($line)
}

function Add-Check {
    param(
        [string]$Name,
        [ValidateSet('passed', 'failed', 'blocked', 'not_run')][string]$Status,
        [string]$Command,
        [string]$Detail,
        [int]$ExitCode = -1
    )
    $check = [pscustomobject]@{
        name = $Name
        status = $Status
        command = $Command
        exitCode = $ExitCode
        detail = $Detail
    }
    $script:Checks.Add($check) | Out-Null
    Write-RunLog ("{0}: {1}; exit={2}; {3}" -f $Name, $Status, $ExitCode, $Detail)
}

function Invoke-LocalCommand {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$CommandLabel,
        [switch]$Probe,
        [switch]$Cleanup,
        [switch]$QuietOutput,
        [string[]]$UnsetEnvironmentVariables,
        [string]$DatabaseUrl,
        [string]$WorkingDirectory
    )
    if ($script:FailureSeen -and -not $Probe -and -not $Cleanup) {
        Add-Check $Name 'not_run' $CommandLabel 'Detenido despuÃ©s del primer comando fallido.'
        return $false
    }
    if ([string]::IsNullOrWhiteSpace($FilePath) -or -not (Test-Path -LiteralPath $FilePath)) {
        Add-Check $Name 'blocked' $CommandLabel 'No se encontrÃ³ el ejecutable requerido.'
        return $false
    }

    Write-RunLog ("COMMAND {0}" -f $CommandLabel)
    $savedEnvironment = @{}
    foreach ($item in Get-ChildItem Env:) {
        if (($item.Name -match $script:SensitiveEnvironment -and $item.Name -notmatch '^(?i:PUBLIC_)') -or $item.Name -in $UnsetEnvironmentVariables) {
            $savedEnvironment[$item.Name] = $item.Value
            Remove-Item -LiteralPath ("Env:{0}" -f $item.Name)
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($DatabaseUrl)) {
        $env:SUPABASE_DB_URL = $DatabaseUrl
    }

    $outputLines = @()
    $exit = 1
    $commandDirectory = if ([string]::IsNullOrWhiteSpace($WorkingDirectory)) { $repoRoot } else { (Resolve-Path -LiteralPath $WorkingDirectory).Path }
    try {
        Push-Location -LiteralPath $commandDirectory
        try {
            $rawOutput = & $FilePath @Arguments 2>&1
            $exit = $LASTEXITCODE
            if ($null -eq $exit) { $exit = 0 }
            $outputLines = @($rawOutput | ForEach-Object { [string]$_ })
        }
        finally {
            Pop-Location
        }
    }
    catch {
        $outputLines += $_.Exception.Message
        $exit = 1
    }
    finally {
        if (-not [string]::IsNullOrWhiteSpace($DatabaseUrl)) {
            Remove-Item Env:SUPABASE_DB_URL -ErrorAction SilentlyContinue
        }
        foreach ($name in $savedEnvironment.Keys) {
            Set-Item -LiteralPath ("Env:{0}" -f $name) -Value $savedEnvironment[$name]
        }
    }
    $script:LastCommandOutput = @($outputLines)

    if ($QuietOutput) {
        Write-RunLog 'Command output suppressed to keep local database fixtures out of logs.'
    }
    else {
        foreach ($line in $outputLines) {
            if (-not [string]::IsNullOrWhiteSpace($line)) {
                Write-RunLog (Protect-LogText $line)
            }
        }
    }
    if ($exit -eq 0) {
        Add-Check $Name 'passed' $CommandLabel 'Comando completado.' 0
        return $true
    }
    if ($Probe) {
        Add-Check $Name 'blocked' $CommandLabel 'La herramienta existe pero no pudo inicializarse en este entorno.' $exit
        return $false
    }
    Add-Check $Name 'failed' $CommandLabel 'El comando devolviÃ³ error; se detuvieron los comandos posteriores.' $exit
    $script:FailureSeen = $true
    return $false
}

function Add-BlockedForTools {
    param([string]$Name, [string]$Command, [string]$Reason)
    Add-Check $Name 'blocked' $Command $Reason
}

function Invoke-SecretScan {
    if ($script:FailureSeen) {
        Add-Check 'security-secret-pattern-scan' 'not_run' 'rg secret-pattern scan' 'Detenido despuÃ©s del primer comando fallido.'
        return
    }
    if ([string]::IsNullOrWhiteSpace($rgExe) -or -not (Test-Path -LiteralPath $rgExe)) {
        Add-BlockedForTools 'security-secret-pattern-scan' 'rg secret-pattern scan' 'ripgrep no estÃ¡ instalado.'
        return
    }

    $queries = @(
        @{ name = 'Google key marker'; pattern = 'AIza[S]y'; globs = @('*.yml', '*.yaml', '*.ts'); excludes = @('!.github/workflows/**', '!node_modules/**', '!.env.example'); lineFilter = $null },
        @{ name = 'payment key marker'; pattern = 's[k]_live|s[k]_test'; globs = @('*.ts', '*.yml'); excludes = @('!.github/**', '!node_modules/**'); lineFilter = $null },
        @{ name = 'credential/JWT marker'; pattern = 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sbp_[A-Za-z0-9]{20,}|SUPABASE_SERVICE_ROLE_KEY[[:space:]]*[:=][[:space:]]*["'']|SUPABASE_ACCESS_TOKEN[[:space:]]*[:=][[:space:]]*["'']'; globs = @('*.ts', '*.js', '*.mjs', '*.sh', '*.yml', '*.yaml'); excludes = @('!*.test.ts', '!*.spec.ts', '!.github/**', '!node_modules/**'); lineFilter = '(?i)(process\.env|import\.meta\.env|secrets\.|<token>|placeholder|REPLACE_WITH)' }
    )

    Write-RunLog 'COMMAND rg secret-pattern scan (matches are never written to the log)'
    $found = New-Object 'System.Collections.Generic.List[string]'
    Push-Location -LiteralPath $repoRoot
    try {
        foreach ($query in $queries) {
            $arguments = @('-n', '--hidden')
            foreach ($glob in $query.globs) { $arguments += @('--glob', $glob) }
            foreach ($glob in $query.excludes) { $arguments += @('--glob', $glob) }
            $arguments += @('--glob', '!.git/**', $query.pattern, '.')
            try {
                $rawMatches = & $rgExe @arguments 2>$null
                $rgExit = $LASTEXITCODE
                $matches = @($rawMatches | ForEach-Object { [string]$_ })
            }
            catch {
                Add-Check 'security-secret-pattern-scan' 'failed' 'rg secret-pattern scan' 'ripgrep no pudo completar el escaneo.' 2
                $script:FailureSeen = $true
                return
            }
            if ($rgExit -gt 1) {
                Add-Check 'security-secret-pattern-scan' 'failed' 'rg secret-pattern scan' 'ripgrep devolviÃ³ un error de ejecuciÃ³n.' $rgExit
                $script:FailureSeen = $true
                return
            }
            foreach ($match in $matches) {
                $parts = $match -split ':', 3
                $lineText = if ($parts.Count -ge 3) { $parts[2] } else { $match }
                if ($query.lineFilter -and $lineText -match $query.lineFilter) { continue }
                $path = if ($parts.Count -ge 1) { $parts[0] } else { 'unknown' }
                $found.Add("{0}: {1}" -f $query.name, $path) | Out-Null
            }
        }
    }
    finally { Pop-Location }
    if ($found.Count -eq 0) {
        Add-Check 'security-secret-pattern-scan' 'passed' 'rg secret-pattern scan' 'No se encontraron patrones sospechosos.' 0
    }
    else {
        Add-Check 'security-secret-pattern-scan' 'failed' 'rg secret-pattern scan' ("Se encontraron {0} coincidencias; solo se registraron rutas, nunca valores." -f $found.Count) 1
        foreach ($item in $found) { Write-RunLog ("MATCH {0}" -f $item) }
        $script:FailureSeen = $true
    }
}

function Get-GitValue {
    param([string[]]$Arguments)
    if ([string]::IsNullOrWhiteSpace($gitExe)) { return '' }
    try {
        $value = & $gitExe -c ("safe.directory={0}" -f $repoRoot.Replace('\', '/')) -C $repoRoot @Arguments 2>$null
        if ($LASTEXITCODE -eq 0) { return ([string]$value).Trim() }
    }
    catch { return '' }
    return ''
}

$commit = Get-GitValue @('rev-parse', 'HEAD')
$branch = Get-GitValue @('branch', '--show-current')
$windowsVersion = [Environment]::OSVersion.Version.ToString()
$nodeVersion = if ([string]::IsNullOrWhiteSpace($nodeExe)) { 'missing' } else { 'not probed' }
$pnpmVersion = if ([string]::IsNullOrWhiteSpace($pnpmCmd)) { 'missing' } else { 'not probed' }
$pnpmUsable = $false
$dockerUsable = $false
$psqlUsable = $false
$supabaseVersion = 'missing'

Write-RunLog ("Autamedica local CI start; repo={0}; commit={1}; branch={2}; OS=Windows {3}; x64={4}; PowerShell={5}" -f $repoRoot, $commit, $branch, $windowsVersion, [Environment]::Is64BitOperatingSystem, $PSVersionTable.PSVersion)
Write-RunLog ("Local logs: {0}" -f $logPath)

if ($nodeExe) {
    Invoke-LocalCommand 'runtime-node-version' $nodeExe @('--version') 'node --version' | Out-Null
    $nodeVersion = ([string]($script:LastCommandOutput | Select-Object -First 1)).Trim()
    if ($nodeVersion -notmatch '^v22\.') {
        Add-BlockedForTools 'runtime-node-version-policy' 'Node.js version check' ("El workflow fija Node 22; este equipo tiene {0}." -f $nodeVersion)
    }
}
else {
    Add-BlockedForTools 'runtime-node-version' 'node --version' 'Node.js no estÃ¡ instalado.'
}

if ($pnpmCmd) {
    $pnpmUsable = Invoke-LocalCommand 'runtime-pnpm-version' $pnpmCmd @('--version') 'pnpm.cmd --version' -Probe
    $pnpmVersion = if ($pnpmUsable) { ([string]($script:LastCommandOutput | Select-Object -First 1)).Trim() } else { 'initialization failed' }
    if ($pnpmUsable -and $pnpmVersion -ne '9.15.2') {
        Add-BlockedForTools 'runtime-pnpm-version-policy' 'pnpm version check' ("El workflow fija pnpm 9.15.2; este equipo tiene {0}." -f $pnpmVersion)
        $pnpmUsable = $false
    }
}
else {
    Add-BlockedForTools 'runtime-pnpm-version' 'pnpm.cmd --version' 'pnpm no estÃ¡ instalado.'
}

if ($dockerExe) {
    $dockerUsable = Invoke-LocalCommand 'docker-engine' $dockerExe @('info', '--format', '{{.ServerVersion}}') 'docker info --format <ServerVersion>' -Probe
}
if ($psqlExe) {
    $psqlUsable = Invoke-LocalCommand 'psql-version' $psqlExe @('--version') 'psql --version' -Probe
}
if ($supabaseExe) {
    Invoke-LocalCommand 'supabase-cli-version' $supabaseExe @('--version') 'supabase --version' -Probe -WorkingDirectory $LogDirectory | Out-Null
    $supabaseVersion = ([string]($script:LastCommandOutput | Select-Object -First 1)).Trim()
}

$nodeModules = Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules')
$nodeTests = @(
    @{ name = 'newsletter-audience-safeguards'; args = @('--test', 'apps/newsletter-worker/scripts/sync-newsletter-audience.test.mjs') },
    @{ name = 'memed-deploy-configuration'; args = @('--test', 'scripts/ops/sync-memed-secrets.test.mjs') },
    @{ name = 'service-worker-clinical-privacy'; args = @('--test', 'scripts/security/service-worker-privacy.test.mjs') },
    @{ name = 'actor-scoped-telemedicine'; args = @('--experimental-strip-types', '--test', 'supabase/functions/update-call-status/handler.test.ts') }
)
foreach ($test in $nodeTests) {
    Invoke-LocalCommand $test.name $nodeExe $test.args ("node {0}" -f ($test.args -join ' ')) | Out-Null
}

if ($pythonExe -and $bashExe) {
    Invoke-LocalCommand 'backup-publication-python-tests' $pythonExe @('scripts/db/test_logical_backup.py') 'python scripts/db/test_logical_backup.py' | Out-Null
}
else {
    $missing = @()
    if (-not $pythonExe) { $missing += 'Python' }
    if (-not $bashExe) { $missing += 'Bash (required by the test subprocesses)' }
    Add-BlockedForTools 'backup-publication-python-tests' 'python scripts/db/test_logical_backup.py' ("Falta(n): {0}." -f ($missing -join ', '))
}

if (-not $script:FailureSeen -and $nodeExe) {
    Invoke-LocalCommand 'hardcode-validation' $nodeExe @('scripts/validate-no-hardcode.mjs') 'node scripts/validate-no-hardcode.mjs' | Out-Null
}
elseif (-not $nodeExe) {
    Add-BlockedForTools 'hardcode-validation' 'node scripts/validate-no-hardcode.mjs' 'Node.js no estÃ¡ instalado.'
}
else {
    Add-Check 'hardcode-validation' 'not_run' 'node scripts/validate-no-hardcode.mjs' 'Detenido despuÃ©s del primer comando fallido.'
}

Invoke-SecretScan

$packageCommands = @(
    @{ name = 'architecture-v2'; args = @('arch:v2:check') },
    @{ name = 'changed-architecture-imports'; args = @('arch:v2:imports:changed') },
    @{ name = 'typecheck'; args = @('typecheck') },
    @{ name = 'workspace-package-build'; args = @('build:packages:core') },
    @{ name = 'web-build'; args = @('--filter', '@autamedica/web', 'build') },
    @{ name = 'lint'; args = @('lint') },
    @{ name = 'hardcode-package-check'; args = @('hardcode:check') },
    @{ name = 'unit-tests'; args = @('test:unit') }
)
foreach ($item in $packageCommands) {
    $label = "pnpm {0}" -f ($item.args -join ' ')
    if ($script:FailureSeen) {
        Add-Check $item.name 'not_run' $label 'Detenido despuÃ©s del primer comando fallido.'
    }
    elseif (-not $pnpmUsable) {
        Add-BlockedForTools $item.name $label 'pnpm no puede inicializarse en este entorno.'
    }
    elseif (-not $nodeModules) {
        Add-BlockedForTools $item.name $label 'Faltan dependencias instaladas del monorepo (node_modules).'
    }
    else {
        Invoke-LocalCommand $item.name $pnpmCmd $item.args $label | Out-Null
    }
}

$denoCommands = @(
    @{ name = 'clinical-edge-prescription-check'; args = @('check', '--no-lock', 'supabase/functions/issue-prescription/index.ts') },
    @{ name = 'clinical-edge-prescription-tests'; args = @('test', '--no-lock', '--allow-env', '--allow-net', 'supabase/functions/tests/issue-prescription.test.ts') }
)
foreach ($item in $denoCommands) {
    if ($script:FailureSeen) {
        Add-Check $item.name 'not_run' ("deno {0}" -f ($item.args -join ' ')) 'Detenido despuÃ©s del primer comando fallido.'
    }
    elseif (-not $denoExe) {
        Add-BlockedForTools $item.name ("deno {0}" -f ($item.args -join ' ')) 'Deno no estÃ¡ instalado.'
    }
    else {
        Invoke-LocalCommand $item.name $denoExe $item.args ("deno {0}" -f ($item.args -join ' ')) | Out-Null
    }
}

if ($script:FailureSeen) {
    Add-Check 'database-and-rls' 'not_run' 'supabase start / db reset / psql RLS suite' 'Detenido despuÃ©s del primer comando fallido.'
}
elseif (-not $dockerExe -or -not $dockerUsable -or -not $psqlExe -or -not $psqlUsable) {
    $missing = @()
    if (-not $dockerExe -or -not $dockerUsable) { $missing += 'Docker Engine' }
    if (-not $psqlExe -or -not $psqlUsable) { $missing += 'psql' }
    Add-BlockedForTools 'database-and-rls' 'supabase start / db reset / psql RLS suite' ("Falta(n): {0}; el job usa Supabase local en Docker." -f ($missing -join ', '))
}
elseif (-not $supabaseExe) {
    Add-BlockedForTools 'database-and-rls' 'supabase start / db reset / psql RLS suite' 'Supabase CLI no estÃ¡ instalado.'
}
elseif ($supabaseVersion -notmatch '(^|\s)2\.122\.0(\s|$)') {
    Add-BlockedForTools 'database-and-rls' 'supabase start / db reset / psql RLS suite' ("El workflow fija Supabase CLI 2.122.0; este equipo tiene: {0}." -f $supabaseVersion)
}
elseif (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'supabase/.temp/cli-latest'))) {
    Add-BlockedForTools 'database-and-rls' 'supabase start / db reset / psql RLS suite' 'Falta el archivo de estado local de Supabase; no se iniciarÃ¡ la suite para evitar artefactos no revisados.'
}
elseif (-not [string]::IsNullOrWhiteSpace((Get-GitValue @('status', '--porcelain', '--', 'supabase/.temp/cli-latest')))) {
    Add-BlockedForTools 'database-and-rls' 'supabase start / db reset / psql RLS suite' 'supabase/.temp/cli-latest ya contiene cambios locales; no se sobrescribirÃ¡.'
}
else {
    $supabaseMetadataPath = Join-Path $repoRoot 'supabase/.temp/cli-latest'
    $supabaseMetadataBefore = [IO.File]::ReadAllBytes($supabaseMetadataPath)
    $databaseStartAttempted = $true
    try {
        $startOk = Invoke-LocalCommand 'supabase-start-local' $supabaseExe @('start') 'supabase start (local Docker project)' -QuietOutput -UnsetEnvironmentVariables @('SUPABASE_INTERNAL_IMAGE_REGISTRY')
        if ($startOk) {
            $resetOk = Invoke-LocalCommand 'supabase-reset-local' $supabaseExe @('db', 'reset', '--local') 'supabase db reset --local' -QuietOutput
            if ($resetOk) {
                $sqlFiles = @(
                    @{ name = 'clinical-country-isolation'; file = 'supabase/tests/clinical_country_isolation.sql'; isolated = $true },
                    @{ name = 'electronic-certificate-demo'; file = 'supabase/tests/ar_electronic_certificate_demo_smoke.sql'; isolated = $true },
                    @{ name = 'pharmacy-guest-identity-isolation'; file = 'supabase/tests/pharmacy_guest_identity_isolation.sql'; isolated = $true },
                    @{ name = 'pharmacy-referral-commission-isolation'; file = 'supabase/tests/pharmacy_referral_commission_isolated.sql'; isolated = $true },
                    @{ name = 'rls-core-tables'; file = 'supabase/tests/rls_core_tables.sql'; isolated = $false },
                    @{ name = 'farmalink-once-only'; file = 'supabase/tests/farmalink_once_only_issue.sql'; isolated = $false },
                    @{ name = 'memed-provider-integrity'; file = 'supabase/tests/memed_provider_integrity_smoke.sql'; isolated = $false },
                    @{ name = 'internal-trigger-permissions'; file = 'supabase/tests/internal_trigger_permissions.sql'; isolated = $false },
                    @{ name = 'auth-helper-permissions'; file = 'supabase/tests/auth_helper_permissions.sql'; isolated = $false },
                    @{ name = 'clinical-rls-initplans'; file = 'supabase/tests/clinical_rls_initplans.sql'; isolated = $false },
                    @{ name = 'native-session-cleanup'; file = 'supabase/tests/native_session_cleanup.sql'; isolated = $true }
                )
                foreach ($item in $sqlFiles) {
                    if ($script:FailureSeen) {
                        Add-Check $item.name 'not_run' ("psql local database {0}" -f $item.file) 'Detenido despuÃ©s del primer comando fallido.'
                        continue
                    }
                    $arguments = @('postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-v', 'ON_ERROR_STOP=1')
                    if ($item.isolated) { $arguments += @('-c', "SET autamedica.isolated_test = 'on'") }
                    $arguments += @('-f', $item.file)
                    Invoke-LocalCommand $item.name $psqlExe $arguments ("psql local database {0}" -f $item.file) -QuietOutput | Out-Null
                }
                if (-not $script:FailureSeen -and $pythonExe) {
                    Invoke-LocalCommand 'farmalink-concurrency-tests' $pythonExe @('scripts/farmalink/test_once_only_concurrency.py') 'python scripts/farmalink/test_once_only_concurrency.py' -QuietOutput -DatabaseUrl 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' | Out-Null
                }
                elseif (-not $pythonExe) {
                    Add-BlockedForTools 'farmalink-concurrency-tests' 'python scripts/farmalink/test_once_only_concurrency.py' 'Python no estÃ¡ instalado.'
                }
            }
        }
        else {
            Add-Check 'supabase-database-suite' 'not_run' 'local Supabase/RLS commands' 'No se ejecutÃ³: supabase start fallÃ³.'
        }
    }
    finally {
        try {
            if ($databaseStartAttempted) {
                Invoke-LocalCommand 'supabase-stop-local' $supabaseExe @('stop', '--no-backup') 'supabase stop --no-backup' -Cleanup -QuietOutput | Out-Null
            }
        }
        finally {
            $metadataAfter = [IO.File]::ReadAllBytes($supabaseMetadataPath)
            if ([Convert]::ToBase64String($metadataAfter) -ne [Convert]::ToBase64String($supabaseMetadataBefore)) {
                [IO.File]::WriteAllBytes($supabaseMetadataPath, $supabaseMetadataBefore)
                Write-RunLog 'Restored supabase/.temp/cli-latest to its pre-run contents.'
            }
        }
    }
}

$failedCount = @($script:Checks | Where-Object { $_.status -eq 'failed' }).Count
$blockedCount = @($script:Checks | Where-Object { $_.status -eq 'blocked' -or $_.status -eq 'not_run' }).Count
$passedCount = @($script:Checks | Where-Object { $_.status -eq 'passed' }).Count
$checkArray = $script:Checks.ToArray()
if ($failedCount -gt 0) {
    $overall = 'failed'
    $exitCode = 1
}
elseif ($blockedCount -gt 0) {
    $overall = 'blocked'
    $exitCode = 2
}
else {
    $overall = 'passed'
    $exitCode = 0
}

$report = [pscustomobject]@{
    schemaVersion = 1
    startedAtUtc = $runStarted.ToString('o')
    completedAtUtc = [DateTime]::UtcNow.ToString('o')
    repository = 'ecucondorSA/Autamedica'
    commit = $commit
    branch = $branch
    host = [pscustomobject]@{
        os = "Windows $windowsVersion"
        architecture = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
        powershell = $PSVersionTable.PSVersion.ToString()
        node = $nodeVersion
        pnpm = $pnpmVersion
        supabase = $supabaseVersion
    }
    overall = $overall
    exitCode = $exitCode
    counts = [pscustomobject]@{ passed = $passedCount; failed = $failedCount; blockedOrNotRun = $blockedCount }
    logFile = $logPath
    checks = $checkArray
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-RunLog ("RESULT overall={0}; exit={1}; passed={2}; failed={3}; blocked-or-not-run={4}; report={5}" -f $overall, $exitCode, $passedCount, $failedCount, $blockedCount, $reportPath)
exit $exitCode

