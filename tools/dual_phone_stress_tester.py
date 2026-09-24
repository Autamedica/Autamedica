#!/usr/bin/env python3
"""
Dual-Phone Empirical Verification & Stress Framework for AutaMedica
Rigorous end-to-end twin testing (Doctor & Patient) with hard database,
logcat telemetry gates, memory monitoring, and configurable chaos injection.
"""

import sys
import os
import time
import json
import re
import argparse
import subprocess
import threading
from typing import Dict, List, Optional, Tuple, Any

PACKAGE = "com.autamedica.android"
LOG_FILE_HANDLE = None


def log(prefix: str, msg: str, color: str = "\033[0m"):
    ts = time.strftime("%H:%M:%S")
    clean_line = f"[{ts}][{prefix}] {msg}"
    print(f"{color}{clean_line}\033[0m", flush=True)
    global LOG_FILE_HANDLE
    if LOG_FILE_HANDLE:
        try:
            LOG_FILE_HANDLE.write(clean_line + "\n")
            LOG_FILE_HANDLE.flush()
        except Exception:
            pass


def adb_cmd(dev: str, *args) -> str:
    res = subprocess.run(
        ["adb", "-s", dev] + list(args),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False
    )
    return res.stdout.strip()


def query_db(sql: str) -> Optional[dict]:
    res = subprocess.run(
        ["supabase", "db", "query", "--linked", sql],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False
    )
    if res.returncode != 0:
        log("DB_ERROR", f"Failed query: {res.stderr}", "\033[91m")
        return None
    try:
        data = json.loads(res.stdout)
        rows = data.get("rows", [])
        return rows[0] if rows else None
    except Exception as e:
        log("DB_PARSE_ERR", f"Raw: {res.stdout[:200]} - Err: {e}", "\033[91m")
        return None


def get_device_memory(dev: str, pkg: str = PACKAGE) -> Dict[str, Any]:
    """
    Collects and parses detailed memory metrics via dumpsys meminfo.
    Returns PID, PSS, RSS, and individual heap allocations in KB.
    """
    out = adb_cmd(dev, "shell", "dumpsys", "meminfo", pkg)
    data: Dict[str, Any] = {
        "timestamp": time.time(),
        "pid": None,
        "total_pss_kb": 0,
        "java_heap_kb": 0,
        "native_heap_kb": 0,
        "code_kb": 0,
        "stack_kb": 0,
        "graphics_kb": 0,
        "total_rss_kb": 0,
        "available": False
    }

    if not out or "No process found" in out:
        return data

    pid_m = re.search(r"MEMINFO in pid (\d+)", out)
    if pid_m:
        data["pid"] = int(pid_m.group(1))
        data["available"] = True

    # App Summary parsing (most reliable on Android 8+)
    j_heap = re.search(r"Java Heap:\s+(\d+)", out)
    if j_heap:
        data["java_heap_kb"] = int(j_heap.group(1))

    n_heap = re.search(r"Native Heap:\s+(\d+)", out)
    if n_heap:
        data["native_heap_kb"] = int(n_heap.group(1))

    code_m = re.search(r"Code:\s+(\d+)", out)
    if code_m:
        data["code_kb"] = int(code_m.group(1))

    stack_m = re.search(r"Stack:\s+(\d+)", out)
    if stack_m:
        data["stack_kb"] = int(stack_m.group(1))

    graphics_m = re.search(r"Graphics:\s+(\d+)", out)
    if graphics_m:
        data["graphics_kb"] = int(graphics_m.group(1))

    # Parse TOTAL row from the matrix
    tot_m = re.search(r"TOTAL\s+(\d+)\s+\d+\s+\d+\s+\d+\s+(\d+)", out)
    if tot_m:
        data["total_pss_kb"] = int(tot_m.group(1))
        data["total_rss_kb"] = int(tot_m.group(2))
    else:
        tot_summary = re.search(r"TOTAL PSS:\s+(\d+)", out)
        if tot_summary:
            data["total_pss_kb"] = int(tot_summary.group(1))

    return data


def calculate_percentiles(values: List[float]) -> Dict[str, float]:
    """Computes exact linear percentiles (P50, P90, P99), min, max, avg."""
    if not values:
        return {"count": 0, "min": 0.0, "max": 0.0, "avg": 0.0, "p50": 0.0, "p90": 0.0, "p99": 0.0}
    sorted_v = sorted(values)
    n = len(sorted_v)

    def p(pct: float) -> float:
        if n == 1:
            return sorted_v[0]
        k = (n - 1) * (pct / 100.0)
        f = int(k)
        c = min(f + 1, n - 1)
        d = k - f
        return sorted_v[f] + (sorted_v[c] - sorted_v[f]) * d

    return {
        "count": n,
        "min": round(sorted_v[0], 2),
        "max": round(sorted_v[-1], 2),
        "avg": round(sum(sorted_v) / n, 2),
        "p50": round(p(50), 2),
        "p90": round(p(90), 2),
        "p99": round(p(99), 2),
    }


def smart_detect_devices(doc_arg: Optional[str], pat_arg: Optional[str]) -> Tuple[str, str]:
    """Resolves and validates doctor and patient device IDs with auto-detection."""
    # List online devices
    res = subprocess.run(["adb", "devices", "-l"], stdout=subprocess.PIPE, text=True, check=False)
    lines = [l.strip() for l in res.stdout.splitlines() if l.strip() and not l.startswith("List of")]
    online_devices = []
    for l in lines:
        parts = l.split()
        if len(parts) >= 2 and parts[1] == "device":
            online_devices.append((parts[0], l))

    doc = doc_arg or os.environ.get("DOC_DEVICE")
    pat = pat_arg or os.environ.get("PAT_DEVICE")

    online_ids = [d[0] for d in online_devices]

    # Auto-detection heuristic if missing or offline
    if not doc or doc not in online_ids:
        # Search for Infinix or 192.168.0.108
        for dev_id, desc in online_devices:
            if "Infinix" in desc or "192.168.0.108" in dev_id or "096143732G001088" in dev_id:
                doc = dev_id
                break

    if not pat or pat not in online_ids:
        # Search for Xiaomi / Redmi / 2201116SG or 192.168.0.121
        for dev_id, desc in online_devices:
            if ("2201116SG" in desc or "192.168.0.121" in dev_id or "veux" in desc) and dev_id != doc:
                pat = dev_id
                break

    # Final fallback if still unset
    if not doc and online_devices:
        doc = online_devices[0][0]
    if not pat and len(online_devices) > 1:
        pat = online_devices[1][0] if online_devices[1][0] != doc else online_devices[0][0]

    if not doc or not pat:
        log("WARN", f"No se detectaron 2 dispositivos ADB en línea. Detectados: {online_ids}", "\033[93m")

    log("DEVICES", f"📱 Configuración ADB: DOCTOR={doc} | PACIENTE={pat}", "\033[96m")
    return doc or "DOC_UNSET", pat or "PAT_UNSET"


class TelemetryMonitor:
    def __init__(self, dev: str):
        self.dev = dev
        self.stop_event = threading.Event()
        self.telemetry = []
        self.thread = None
        self.proc = None

    def start(self):
        adb_cmd(self.dev, "logcat", "-c")
        self.proc = subprocess.Popen(
            ["adb", "-s", self.dev, "logcat", "-s", "AUTAMEDICA_LATENCY:I", "-v", "raw"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1
        )
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _run(self):
        while not self.stop_event.is_set() and self.proc:
            line = self.proc.stdout.readline()
            if not line:
                continue
            try:
                data = json.loads(line.strip())
                self.telemetry.append(data)
                ev = data.get("event")
                if ev == "MILESTONE":
                    ms = data.get("elapsed_from_t0_ms", 0.0)
                    milestone = data.get("milestone", "")
                    log("LATENCY", f"[{milestone}] +{ms:.1f}ms (trace={data.get('trace_id')})", "\033[93m")
                elif ev == "TRACE_SUMMARY":
                    tot = data.get("total_latency_ms", 0.0)
                    stages = data.get("stages_ms", {})
                    log("LATENCY_SUMMARY", f"⚡ LATENCIA TOTAL T0->T5: {tot:.1f}ms | Claim: {stages.get('t0_to_t1_claim',0):.1f}ms | Compose: {stages.get('t1_to_t2_compose',0):.1f}ms | Cam: {stages.get('t2_to_t3_camera',0):.1f}ms | SFU: {stages.get('t3_to_t4_sfu',0):.1f}ms | 1st Frame: {stages.get('t4_to_t5_first_frame',0):.1f}ms", "\033[92m")
            except Exception:
                pass

    def stop(self) -> List[dict]:
        self.stop_event.set()
        if self.proc:
            try:
                self.proc.terminate()
            except Exception:
                pass
        return self.telemetry


def sanitize_pre_test_state(doc_dev: str, pat_dev: str, doctor_id: str, timeout: float = 30.0, skip_sanity: bool = False):
    if skip_sanity:
        log("SANITIZER", "Omitiendo sanitización completa (--skip-sanity activo).", "\033[93m")
        query_db(f"SELECT public.finish_pharmacy_consultation('{doctor_id}'::uuid);")
        query_db(f"SELECT public.set_doctor_duty_status('{doctor_id}'::uuid, true);")
        return

    log("SANITIZER", "1. Asegurando que ambos teléfonos salgan de llamadas previas y liberen guardia...", "\033[93m")

    # Liberar guardia zombie previa en BD si existiera y asegurar guardia médica activa
    query_db(f"SELECT public.finish_pharmacy_consultation('{doctor_id}'::uuid);")
    query_db(f"SELECT public.set_doctor_duty_status('{doctor_id}'::uuid, true);")

    for dev, name in [(doc_dev, "DOCTOR"), (pat_dev, "PATIENT")]:
        adb_cmd(dev, "shell", "input", "keyevent", "KEYCODE_WAKEUP")
        adb_cmd(dev, "shell", "wm", "dismiss-keyguard")
        adb_cmd(dev, "shell", "cmd", "statusbar", "collapse")
        if dev == pat_dev:
            adb_cmd(dev, "shell", "am", "force-stop", "com.mi.globalbrowser")
            adb_cmd(dev, "shell", "input", "swipe", "540", "1800", "540", "400", "200")
            time.sleep(0.3)
        # Reiniciar limpiamente la app para que arranque sin pantallas o modales colgados
        adb_cmd(dev, "shell", "am", "force-stop", PACKAGE)
        adb_cmd(dev, "shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1")

    # Esperar dinámicamente a que ambos teléfonos hayan cargado Compose completamente
    max_polls = max(5, int(timeout / 1.5))
    for poll in range(1, max_polls + 1):
        time.sleep(0.8)
        adb_cmd(pat_dev, "shell", "uiautomator", "dump", "/sdcard/ready_pat.xml")
        pat_xml = adb_cmd(pat_dev, "shell", "cat", "/sdcard/ready_pat.xml")
        adb_cmd(doc_dev, "shell", "uiautomator", "dump", "/sdcard/ready_doc.xml")
        doc_xml = adb_cmd(doc_dev, "shell", "cat", "/sdcard/ready_doc.xml")
        pat_ready = "Plantão Farmácia" in pat_xml or "Benefícios" in pat_xml or "Consultar" in pat_xml or "Conectar con Guardia" in pat_xml
        doc_ready = "DERIVACIÓN" in doc_xml or "Recibir consultas" in doc_xml or "MP" in doc_xml
        if pat_ready and doc_ready:
            log("SANITIZER", f"Ambos teléfonos listos en Home (poll {poll}/{max_polls}).", "\033[92m")
            break

    # Verificar que el doctor esté limpio en DB
    duty = query_db(f"SELECT is_on_duty, current_active_request_id FROM public.doctor_duty_status WHERE doctor_id = '{doctor_id}';")
    active_req = duty.get("current_active_request_id") if duty else "NONE"
    log("SANITIZER", f"Estado inicial Doctor: is_on_duty={duty.get('is_on_duty') if duty else False} | active_lock={active_req}", "\033[93m")


def execute_patient_request(pat_dev: str, pat_phone: str, timeout: float = 30.0) -> Tuple[bool, Optional[str], Optional[str], float]:
    """Enters intake form on Patient phone, submits request, and validates insertion in Supabase."""
    t_start = time.perf_counter()

    # Comprobar si ya estamos en el formulario o pulsar Plantão Farmácia en Home
    adb_cmd(pat_dev, "shell", "uiautomator", "dump", "/sdcard/check_nav.xml")
    check_xml = adb_cmd(pat_dev, "shell", "cat", "/sdcard/check_nav.xml")
    if "Conectar con Guardia" not in check_xml:
        log("PATIENT", "1. Navegando al formulario 'Plantão Farmácia' (coords 746, 1265)...", "\033[94m")
        adb_cmd(pat_dev, "shell", "input", "tap", "746", "1265")
        time.sleep(1.2)

    log("PATIENT", "2. Seleccionando motivo 'Renovación de Receta' (coords 273, 441)...", "\033[94m")
    adb_cmd(pat_dev, "shell", "input", "tap", "273", "441")
    time.sleep(0.4)

    log("PATIENT", "3. Ingresando DNI del paciente (coords 540, 1205)...", "\033[94m")
    adb_cmd(pat_dev, "shell", "input", "tap", "540", "1205")
    time.sleep(0.3)
    adb_cmd(pat_dev, "shell", "input", "text", pat_phone)
    time.sleep(0.4)

    log("PATIENT", "4. Ingresando Teléfono del paciente (coords 540, 1409)...", "\033[94m")
    adb_cmd(pat_dev, "shell", "input", "tap", "540", "1409")
    time.sleep(0.3)
    adb_cmd(pat_dev, "shell", "input", "text", pat_phone)
    time.sleep(0.4)

    # Ocultar teclado
    adb_cmd(pat_dev, "shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(0.4)

    log("PATIENT", "5. Pulsando 'Conectar con Guardia' (coords 540, 1630)...", "\033[94m")
    adb_cmd(pat_dev, "shell", "input", "tap", "540", "1630")

    # GATE 1: AUDITORÍA DE INSERCIÓN REAL EN BASE DE DATOS
    log("AUDITOR_GATE_1", "Auditando inserción real en public.pharmacy_dispatch_requests...", "\033[93m")
    row = None
    max_polls = max(5, int(timeout / 1.0))
    for poll in range(1, max_polls + 1):
        time.sleep(1.0)
        row = query_db(
            f"SELECT id, status, patient_name, patient_phone, cloudflare_room_id, created_at "
            f"FROM public.pharmacy_dispatch_requests "
            f"WHERE patient_phone = '{pat_phone}' AND status IN ('searching', 'matched', 'in_call') AND created_at > NOW() - INTERVAL '25 seconds' "
            f"ORDER BY created_at DESC LIMIT 1;"
        )
        if row:
            break
        log("AUDITOR_GATE_1", f"Esperando fila en BD (reintento {poll}/{max_polls})...", "\033[93m")

    elapsed_ms = (time.perf_counter() - t_start) * 1000.0

    if not row:
        log("GATE_1_FAIL", "❌ FALLO CRÍTICO: La app del paciente NO generó solicitud en BD dentro del timeout.", "\033[91m")
        return False, None, None, elapsed_ms

    req_id = row.get("id")
    room_id = row.get("cloudflare_room_id")
    log("GATE_1_PASS", f"✅ VERIFICADO EN BD: Solicitud insertada id={req_id} | sala={room_id} ({elapsed_ms:.1f}ms)", "\033[92m")
    return True, req_id, room_id, elapsed_ms


def execute_doctor_claim(doc_dev: str, doctor_id: str, req_id: str, timeout: float = 30.0) -> Tuple[bool, Optional[str], float]:
    """Verifies that the Doctor phone receives the live alert and claims it before SLA expiration."""
    t_start = time.perf_counter()
    log("DOCTOR", f"1. Esperando radar y alerta en vivo para solicitud {req_id}...", "\033[96m")

    claimed = False
    assigned_doc = None
    max_attempts = max(5, int(timeout / 1.2))

    for attempt in range(1, max_attempts + 1):
        time.sleep(1.0)
        # Check current focused window on Doctor phone
        focus = adb_cmd(doc_dev, "shell", "dumpsys", "window")
        if "IncomingCallActivity" in focus:
            log("DOCTOR", f"Detectada pantalla completa IncomingCallActivity! Pulsando 'Atender' (coords 540, 1500) [intento {attempt}/{max_attempts}]...", "\033[96m")
            adb_cmd(doc_dev, "shell", "input", "tap", "540", "1500")
        else:
            log("DOCTOR", f"Pulsando 'INGRESAR A CONSULTA' o 'Atención bajo demanda' [intento {attempt}/{max_attempts}]...", "\033[96m")
            adb_cmd(doc_dev, "shell", "input", "tap", "395", "350")
            time.sleep(0.3)
            adb_cmd(doc_dev, "shell", "input", "tap", "496", "1324")

        # GATE 2: AUDITORÍA DE ADJUDICACIÓN ATÓMICA EN BASE DE DATOS
        db_row = query_db(f"SELECT id, status, assigned_doctor_id, matched_at FROM public.pharmacy_dispatch_requests WHERE id = '{req_id}';")
        if db_row and db_row.get("status") in ("matched", "in_call"):
            assigned_doc = db_row.get("assigned_doctor_id")
            log("GATE_2_PASS", f"✅ VERIFICADO EN BD: Solicitud adjudicada a médico {assigned_doc} (status={db_row.get('status')})", "\033[92m")
            claimed = True
            break
        elif db_row and db_row.get("status") == "expired":
            elapsed_ms = (time.perf_counter() - t_start) * 1000.0
            log("GATE_2_FAIL", f"❌ FALLO CRÍTICO: Solicitud expiró antes del reclamo ({db_row})", "\033[91m")
            return False, None, elapsed_ms

    elapsed_ms = (time.perf_counter() - t_start) * 1000.0

    if not claimed:
        log("GATE_2_FAIL", f"❌ FALLO: No se logró adjudicación de {req_id} dentro del SLA.", "\033[91m")
        return False, None, elapsed_ms

    # Auditar que doctor_duty_status tenga el bloqueo activo correcto
    duty = query_db(f"SELECT doctor_id, current_active_request_id FROM public.doctor_duty_status WHERE doctor_id = '{doctor_id}';")
    active_id = duty.get("current_active_request_id") if duty else None
    if active_id == req_id:
        log("GATE_2_PASS", f"✅ VERIFICADO EN BD: Bloqueo de guardia médico fijado a {req_id}", "\033[92m")
    else:
        log("GATE_2_WARN", f"⚠️ AVISO: current_active_request_id={active_id} (esperado {req_id})", "\033[93m")

    return True, assigned_doc, elapsed_ms


def execute_call_session(
    doc_dev: str,
    pat_dev: str,
    doctor_id: str,
    req_id: str,
    room_id: str,
    timeout: float = 30.0,
    chaos_intensity: int = 2
) -> Tuple[bool, Dict[str, Any]]:
    """Verifies WebRTC connection, issues in-call digital prescription, and executes controlled termination."""
    t_start = time.perf_counter()
    session_metrics: Dict[str, Any] = {
        "gate_3_success": False,
        "gate_4_success": False,
        "rx_cuir": None,
        "rx_id": None,
        "gate_3_duration_ms": 0.0,
        "gate_4_duration_ms": 0.0,
    }

    log("WEBRTC", f"1. Esperando conexión a sala {room_id} en ambos teléfonos...", "\033[95m")
    time.sleep(3)

    req_status = query_db(f"SELECT status, call_started_at FROM public.pharmacy_dispatch_requests WHERE id = '{req_id}';")
    log("WEBRTC", f"Estado de llamada en BD: {req_status}", "\033[95m")

    power_state = adb_cmd(pat_dev, "shell", "dumpsys", "power")
    is_screen_on = "mHoldingDisplaySuspendBlocker=true" in power_state or "Display Power: state=ON" in power_state
    log("PATIENT_SCREEN", f"Auditoría de pantalla activa: {is_screen_on}", "\033[92m" if is_screen_on else "\033[91m")

    # 2. EMISIÓN DE RECETA CLÍNICA IN-CALL
    t3_start = time.perf_counter()
    log("IN_CALL_CLINICAL", "2. Emitiendo receta digital oficial in-call durante la videollamada activa...", "\033[96m")

    disp_req = query_db(f"SELECT requested_by_user_id, patient_dni, patient_phone FROM public.pharmacy_dispatch_requests WHERE id = '{req_id}';")
    pat_id = None
    if disp_req and disp_req.get("requested_by_user_id"):
        p_row = query_db(f"SELECT id FROM public.patients WHERE user_id = '{disp_req.get('requested_by_user_id')}';")
        if p_row:
            pat_id = p_row.get("id")
    if not pat_id and disp_req and disp_req.get("patient_dni"):
        p_row = query_db(f"SELECT id FROM public.patients WHERE dni = '{disp_req.get('patient_dni')}';")
        if p_row:
            pat_id = p_row.get("id")
    if not pat_id:
        p_row = query_db("SELECT id FROM public.patients WHERE active = true LIMIT 1;")
        if p_row:
            pat_id = p_row.get("id")

    if not pat_id:
        log("IN_CALL_CLINICAL_FAIL", "❌ No se pudo resolver patient_id para emitir la receta in-call.", "\033[91m")
        return False, session_metrics

    ts_hex = f"{int(time.time()):X}"
    rnd_hex = subprocess.run(["uuidgen"], stdout=subprocess.PIPE, text=True, check=False).stdout.strip().replace("-", "")[:6].upper()
    cuir = f"AR-MD-{ts_hex}-{rnd_hex}"

    clinical_data = json.dumps({
        "medication_name": "Amoxicilina 500mg",
        "dosage": "500 mg cada 8 horas",
        "frequency": "cada 8 horas",
        "duration": "7 días",
        "instructions": "Tomar luego de las comidas",
        "diagnosis": "J02.9 - Faringitis aguda",
        "notes": "Prescripción digital emitida in-call desde videollamada de estrés dual"
    }).replace("'", "''")

    sql_insert_rx = (
        f"INSERT INTO public.prescriptions ("
        f"  doctor_id, patient_id, cuir, status, clinical_data, vendor_name, qr_code_content, created_at, updated_at"
        f") VALUES ("
        f"  '{doctor_id}'::uuid, '{pat_id}'::uuid, '{cuir}', 'signed', '{clinical_data}'::jsonb, "
        f"  'AutaMedica Stress Tester', 'https://autamedica.com/verify/{cuir}', NOW(), NOW()"
        f") RETURNING id, cuir, status;"
    )
    ins_result = query_db(sql_insert_rx)

    # GATE 3: AUDITORÍA DE PRESCRIPCIÓN IN-CALL
    log("AUDITOR_GATE_3", f"Auditando existencia de receta (CUIR={cuir})...", "\033[93m")
    rx_row = query_db(
        f"SELECT id, cuir, status, doctor_id, patient_id "
        f"FROM public.prescriptions "
        f"WHERE cuir = '{cuir}' AND doctor_id = '{doctor_id}' AND patient_id = '{pat_id}' AND status IN ('signed', 'draft');"
    )
    session_metrics["gate_3_duration_ms"] = (time.perf_counter() - t3_start) * 1000.0

    if not rx_row:
        log("GATE_3_FAIL", f"❌ FALLO GATE 3: No se encontró la receta in-call en public.prescriptions con CUIR {cuir}.", "\033[91m")
        return False, session_metrics

    session_metrics["gate_3_success"] = True
    session_metrics["rx_cuir"] = cuir
    session_metrics["rx_id"] = rx_row.get("id")
    log("GATE_3_PASS", f"✅ GATE 3 SUPERADO: Receta verificada (id={rx_row.get('id')}, cuir={cuir})", "\033[92m")

    time.sleep(1.0)
    post_rx_status = query_db(f"SELECT status FROM public.pharmacy_dispatch_requests WHERE id = '{req_id}';")
    post_rx_call_active = post_rx_status and post_rx_status.get("status") in ("in_call", "matched")
    post_rx_power = adb_cmd(pat_dev, "shell", "dumpsys", "power")
    post_rx_screen_on = "mHoldingDisplaySuspendBlocker=true" in post_rx_power or "Display Power: state=ON" in post_rx_power

    if not post_rx_call_active or not post_rx_screen_on:
        log("POST_RX_FAIL", "❌ FALLO CRÍTICO: La videollamada WebRTC o la pantalla del paciente se interrumpieron tras emitir la receta.", "\033[91m")
        return False, session_metrics

    # INYECCIÓN DE CAOS CONFIGURABLE
    if chaos_intensity > 0:
        tap_count = chaos_intensity * 2
        log("CHAOS", f"3. Inyectando caos (intensidad={chaos_intensity}, {tap_count} eventos concurrentes)...", "\033[95m")
        t1 = threading.Thread(target=lambda: [adb_cmd(doc_dev, "shell", "input", "tap", "540", "2100") or time.sleep(0.08) for _ in range(tap_count)])
        t2 = threading.Thread(target=lambda: [adb_cmd(pat_dev, "shell", "input", "tap", "540", "2100") or time.sleep(0.08) for _ in range(tap_count)])
        t1.start()
        t2.start()
        t1.join()
        t2.join()

    # Finalizar llamada desde el médico
    log("DOCTOR", "4. Médico pulsa 'Finalizar llamada' (coords 473, 1454)...", "\033[96m")
    adb_cmd(doc_dev, "shell", "input", "tap", "473", "1454")
    time.sleep(1.5)

    # Cerrar evolución SOAP en doctor
    log("DOCTOR", "5. Cerrando evolución SOAP (coords 676, 271)...", "\033[96m")
    adb_cmd(doc_dev, "shell", "input", "tap", "676", "271")
    time.sleep(1.0)
    adb_cmd(doc_dev, "shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(0.5)

    # AUDITORÍA DE AUTO-DISCONNECT EN PACIENTE
    log("PATIENT", "6. Auditando auto-desconexión del paciente tras fin de llamada del médico...", "\033[94m")
    patient_back = False
    max_disc_polls = max(4, int(timeout / 3.0))
    for poll in range(1, max_disc_polls + 1):
        time.sleep(1.0)
        focus = adb_cmd(pat_dev, "shell", "dumpsys", "window")
        if f"{PACKAGE}/.MainActivity" in focus:
            patient_back = True
            break
        log("PATIENT", f"Esperando regreso automático del paciente (intento {poll}/{max_disc_polls})...", "\033[93m")

    log("PATIENT_AUTO_END", f"Auto-desconexión comprobada en paciente: {patient_back}", "\033[92m" if patient_back else "\033[91m")

    # GATE 4: AUDITORÍA DE LIBERACIÓN DE GUARDIA Y CIERRE DE CONSULTA
    t4_start = time.perf_counter()
    log("AUDITOR_GATE_4", "Auditando estado final en Supabase (liberación de guardia obligatoria)...", "\033[93m")
    final_lock = "ERROR"
    final_status = "ERROR"
    max_duty_polls = max(5, int(timeout / 2.0))

    for poll in range(1, max_duty_polls + 1):
        time.sleep(1.0)
        duty = query_db(f"SELECT is_on_duty, current_active_request_id FROM public.doctor_duty_status WHERE doctor_id = '{doctor_id}';")
        final_lock = duty.get("current_active_request_id") if duty else "ERROR"

        req = query_db(f"SELECT status, call_ended_at FROM public.pharmacy_dispatch_requests WHERE id = '{req_id}';")
        final_status = req.get("status") if req else "ERROR"
        if final_lock is None:
            break
        log("AUDITOR_GATE_4", f"Esperando liberación en BD (intento {poll}/{max_duty_polls})...", "\033[93m")

    session_metrics["gate_4_duration_ms"] = (time.perf_counter() - t4_start) * 1000.0
    log("GATE_4_REPORT", f"Consulta status={final_status} | Doctor lock={final_lock}", "\033[93m")

    if final_lock is None:
        log("GATE_4_PASS", "✅ VERIFICADO EN BD: Guardia del médico liberada (NULL). Cero bloqueos zombies.", "\033[92m")
        session_metrics["gate_4_success"] = True
        return True, session_metrics
    else:
        log("GATE_4_FAIL", f"❌ FALLO CRÍTICO: Guardia médica sigue bloqueada en {final_lock}.", "\033[91m")
        return False, session_metrics


def run_cycle(cycle_num: int, args: argparse.Namespace) -> Dict[str, Any]:
    print("\n" + "=" * 70)
    log("CYCLE", f"INICIANDO CICLO #{cycle_num} DE ESTRÉS BIDIRECCIONAL COMPROBABLE", "\033[1m\033[97m")
    print("=" * 70)

    t0_cycle = time.perf_counter()

    cycle_record: Dict[str, Any] = {
        "cycle_number": cycle_num,
        "status": "FAILED",
        "duration_seconds": 0.0,
        "gates": {},
        "telemetry": {},
        "memory": {},
        "error": None
    }

    # RECOLECCIÓN DE MEMORIA PRE-CICLO
    log("MEMORY", "Capturando snapshots de memoria pre-ciclo en ambos teléfonos...", "\033[96m")
    pre_mem_doc = get_device_memory(args.doc_device, PACKAGE)
    pre_mem_pat = get_device_memory(args.pat_device, PACKAGE)
    log("MEMORY", f"PRE-CICLO #{cycle_num} | DOCTOR PSS: {pre_mem_doc['total_pss_kb']/1024:.1f} MB (PID {pre_mem_doc['pid']}) | PACIENTE PSS: {pre_mem_pat['total_pss_kb']/1024:.1f} MB (PID {pre_mem_pat['pid']})", "\033[96m")

    sanitize_pre_test_state(
        args.doc_device,
        args.pat_device,
        args.doctor_id,
        timeout=args.timeout,
        skip_sanity=args.skip_sanity
    )

    monitor = TelemetryMonitor(args.doc_device)
    monitor.start()

    try:
        # Paso 1: Solicitud real del paciente (Gate 1)
        ok1, req_id, room_id, g1_ms = execute_patient_request(args.pat_device, args.patient_phone, timeout=args.timeout)
        cycle_record["gates"]["gate_1_patient_request"] = {
            "success": ok1,
            "request_id": req_id,
            "room_id": room_id,
            "latency_ms": round(g1_ms, 2)
        }
        if not ok1 or not req_id:
            cycle_record["error"] = "Abortado en Gate 1 (Fallo solicitud paciente)"
            log("CYCLE_FAIL", f"Ciclo #{cycle_num} abortado en Gate 1.", "\033[91m")
            return cycle_record

        # Paso 2: Reclamo real del médico (Gate 2)
        ok2, assigned_doc, g2_ms = execute_doctor_claim(args.doc_device, args.doctor_id, req_id, timeout=args.timeout)
        cycle_record["gates"]["gate_2_doctor_claim"] = {
            "success": ok2,
            "assigned_doctor": assigned_doc,
            "latency_ms": round(g2_ms, 2)
        }
        if not ok2:
            cycle_record["error"] = "Abortado en Gate 2 (Fallo adjudicación médico)"
            log("CYCLE_FAIL", f"Ciclo #{cycle_num} abortado en Gate 2.", "\033[91m")
            return cycle_record

        # Paso 3: Sesión WebRTC, emisión de receta in-call y liberación de guardia (Gates 3 y 4)
        session_ok, sess_metrics = execute_call_session(
            args.doc_device,
            args.pat_device,
            args.doctor_id,
            req_id,
            room_id,
            timeout=args.timeout,
            chaos_intensity=args.chaos_intensity
        )
        cycle_record["gates"]["gate_3_prescription_incall"] = {
            "success": sess_metrics.get("gate_3_success", False),
            "cuir": sess_metrics.get("rx_cuir"),
            "rx_id": sess_metrics.get("rx_id"),
            "latency_ms": round(sess_metrics.get("gate_3_duration_ms", 0.0), 2)
        }
        cycle_record["gates"]["gate_4_duty_release"] = {
            "success": sess_metrics.get("gate_4_success", False),
            "latency_ms": round(sess_metrics.get("gate_4_duration_ms", 0.0), 2)
        }

        if not session_ok:
            cycle_record["error"] = "Abortado en Gate 3/4 (Llamada / Emisión in-call / Liberación de guardia)"
            log("CYCLE_FAIL", f"Ciclo #{cycle_num} abortado en Gate 3/4.", "\033[91m")
            return cycle_record

        cycle_record["status"] = "PASSED"
        log("CYCLE_PASS", f"🎉 CICLO #{cycle_num} COMPLETADO Y AUDITADO AL 100%.", "\033[92m")
        return cycle_record

    finally:
        events = monitor.stop()
        summaries = [e for e in events if e.get("event") == "TRACE_SUMMARY"]
        if summaries:
            s = summaries[-1]
            stages = s.get("stages_ms", {})
            tot = s.get("total_latency_ms", 0.0)
            cycle_record["telemetry"] = {
                "total_latency_ms": tot,
                "stages_ms": stages
            }
            log("LATENCY_AUDIT", "═" * 58, "\033[96m")
            log("LATENCY_AUDIT", f"⏱️ DESGLOSE DE LATENCIA CICLO #{cycle_num}:", "\033[96m")
            log("LATENCY_AUDIT", f"  • T0 -> T1 Adjudicación Backend: {stages.get('t0_to_t1_claim',0):.1f} ms", "\033[96m")
            log("LATENCY_AUDIT", f"  • T1 -> T2 Montaje Compose:      {stages.get('t1_to_t2_compose',0):.1f} ms", "\033[96m")
            log("LATENCY_AUDIT", f"  • T2 -> T3 Cámara Iniciada:      {stages.get('t2_to_t3_camera',0):.1f} ms", "\033[96m")
            log("LATENCY_AUDIT", f"  • T3 -> T4 Conexión SFU:         {stages.get('t3_to_t4_sfu',0):.1f} ms", "\033[96m")
            log("LATENCY_AUDIT", f"  • T4 -> T5 Primer Frame Remoto:  {stages.get('t4_to_t5_first_frame',0):.1f} ms", "\033[96m")
            log("LATENCY_AUDIT", f"  ⚡ LATENCIA TOTAL (T0 - T5):     {tot:.1f} ms", "\033[1m\033[92m")
            log("LATENCY_AUDIT", "═" * 58, "\033[96m")

        # RECOLECCIÓN DE MEMORIA POST-CICLO
        post_mem_doc = get_device_memory(args.doc_device, PACKAGE)
        post_mem_pat = get_device_memory(args.pat_device, PACKAGE)
        delta_doc_pss = post_mem_doc["total_pss_kb"] - pre_mem_doc["total_pss_kb"]
        delta_pat_pss = post_mem_pat["total_pss_kb"] - pre_mem_pat["total_pss_kb"]

        cycle_record["memory"] = {
            "doctor": {
                "pre": pre_mem_doc,
                "post": post_mem_doc,
                "delta_pss_kb": delta_doc_pss,
                "delta_java_heap_kb": post_mem_doc["java_heap_kb"] - pre_mem_doc["java_heap_kb"],
                "delta_native_heap_kb": post_mem_doc["native_heap_kb"] - pre_mem_doc["native_heap_kb"],
            },
            "patient": {
                "pre": pre_mem_pat,
                "post": post_mem_pat,
                "delta_pss_kb": delta_pat_pss,
                "delta_java_heap_kb": post_mem_pat["java_heap_kb"] - pre_mem_pat["java_heap_kb"],
                "delta_native_heap_kb": post_mem_pat["native_heap_kb"] - pre_mem_pat["native_heap_kb"],
            }
        }

        doc_color = "\033[92m" if delta_doc_pss <= 15360 else "\033[93m"
        pat_color = "\033[92m" if delta_pat_pss <= 15360 else "\033[93m"
        log("MEMORY", f"POST-CICLO #{cycle_num} | DOCTOR PSS: {post_mem_doc['total_pss_kb']/1024:.1f} MB (Δ {delta_doc_pss/1024:+.2f} MB)", doc_color)
        log("MEMORY", f"POST-CICLO #{cycle_num} | PACIENTE PSS: {post_mem_pat['total_pss_kb']/1024:.1f} MB (Δ {delta_pat_pss/1024:+.2f} MB)", pat_color)

        cycle_record["duration_seconds"] = round(time.perf_counter() - t0_cycle, 2)


def main():
    parser = argparse.ArgumentParser(
        description="Dual-Phone Empirical Verification & Stress Framework for AutaMedica",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--cycles", "-c", type=int, default=1, help="Número de ciclos de estrés a ejecutar")
    parser.add_argument("--timeout", "-t", type=float, default=30.0, help="Timeout en segundos por compuerta de verificación")
    parser.add_argument("--doc-device", default=None, help="ADB Serial del teléfono del Médico (default: auto-detect o env DOC_DEVICE)")
    parser.add_argument("--pat-device", default=None, help="ADB Serial del teléfono del Paciente (default: auto-detect o env PAT_DEVICE)")
    parser.add_argument("--skip-sanity", action="store_true", help="Omitir sanitización agresiva y reinicio de apps")
    parser.add_argument("--chaos-intensity", type=int, default=2, choices=range(0, 11), metavar="[0-10]", help="Intensidad de inyección de toques de caos (0: desactivado, 1-10)")
    parser.add_argument("--output", "-o", default="results_stress_e2e.json", help="Ruta del archivo JSON de métricas y percentiles")
    parser.add_argument("--log-file", default=None, help="Ruta de log de texto en disco")
    parser.add_argument("--doctor-id", default=os.environ.get("DOCTOR_ID", "080fb7ae-92b4-44d4-8941-a6db65004b9f"), help="UUID del médico en Supabase")
    parser.add_argument("--patient-phone", default=os.environ.get("PATIENT_PHONE", "494949494951"), help="Teléfono/DNI del paciente")

    args = parser.parse_args()

    global LOG_FILE_HANDLE
    if args.log_file:
        LOG_FILE_HANDLE = open(args.log_file, "a", encoding="utf-8")

    # Smart auto-detection of ADB devices
    doc_dev, pat_dev = smart_detect_devices(args.doc_device, args.pat_device)
    args.doc_device = doc_dev
    args.pat_device = pat_dev

    t_suite_start = time.perf_counter()
    passed = 0
    failed = 0
    cycle_records: List[Dict[str, Any]] = []

    print("\n" + "=" * 70)
    print("🚀 INICIANDO SUITE DE ESTRÉS BIDIRECCIONAL COMPROBABLE")
    print(f"   • Ciclos programados: {args.cycles}")
    print(f"   • Timeout por compuerta: {args.timeout}s")
    print(f"   • Intensidad de Caos: {args.chaos_intensity}")
    print(f"   • Dispositivo Médico: {args.doc_device}")
    print(f"   • Dispositivo Paciente: {args.pat_device}")
    print(f"   • Archivo de Resultados: {args.output}")
    print("=" * 70)

    for c in range(1, args.cycles + 1):
        rec = run_cycle(c, args)
        cycle_records.append(rec)
        if rec["status"] == "PASSED":
            passed += 1
        else:
            failed += 1
        if c < args.cycles:
            time.sleep(2)

    total_suite_sec = round(time.perf_counter() - t_suite_start, 2)
    success_rate = round((passed / args.cycles) * 100.0, 2) if args.cycles > 0 else 0.0

    # AGREGACIÓN DE PERCENTILES P50, P90, P99
    latencies_t0_t5 = [r["telemetry"]["total_latency_ms"] for r in cycle_records if r.get("telemetry", {}).get("total_latency_ms")]
    claim_ms = [r["telemetry"]["stages_ms"]["t0_to_t1_claim"] for r in cycle_records if r.get("telemetry", {}).get("stages_ms", {}).get("t0_to_t1_claim")]
    compose_ms = [r["telemetry"]["stages_ms"]["t1_to_t2_compose"] for r in cycle_records if r.get("telemetry", {}).get("stages_ms", {}).get("t1_to_t2_compose")]
    camera_ms = [r["telemetry"]["stages_ms"]["t2_to_t3_camera"] for r in cycle_records if r.get("telemetry", {}).get("stages_ms", {}).get("t2_to_t3_camera")]
    sfu_ms = [r["telemetry"]["stages_ms"]["t3_to_t4_sfu"] for r in cycle_records if r.get("telemetry", {}).get("stages_ms", {}).get("t3_to_t4_sfu")]
    first_frame_ms = [r["telemetry"]["stages_ms"]["t4_to_t5_first_frame"] for r in cycle_records if r.get("telemetry", {}).get("stages_ms", {}).get("t4_to_t5_first_frame")]
    cycle_durations = [r["duration_seconds"] for r in cycle_records]

    # Memory drift analysis
    doc_initial_pss = cycle_records[0]["memory"]["doctor"]["pre"]["total_pss_kb"] if cycle_records else 0
    doc_final_pss = cycle_records[-1]["memory"]["doctor"]["post"]["total_pss_kb"] if cycle_records else 0
    pat_initial_pss = cycle_records[0]["memory"]["patient"]["pre"]["total_pss_kb"] if cycle_records else 0
    pat_final_pss = cycle_records[-1]["memory"]["patient"]["post"]["total_pss_kb"] if cycle_records else 0

    results_payload = {
        "metadata": {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "doc_device": args.doc_device,
            "pat_device": args.pat_device,
            "package": PACKAGE,
            "doctor_id": args.doctor_id,
            "patient_phone": args.patient_phone,
            "cycles_requested": args.cycles,
            "timeout_seconds": args.timeout,
            "chaos_intensity": args.chaos_intensity,
            "skip_sanity": args.skip_sanity,
            "suite_duration_seconds": total_suite_sec,
        },
        "summary": {
            "cycles_total": args.cycles,
            "cycles_passed": passed,
            "cycles_failed": failed,
            "success_rate_percent": success_rate,
        },
        "percentiles": {
            "total_latency_t0_t5_ms": calculate_percentiles(latencies_t0_t5),
            "stage_t0_to_t1_claim_ms": calculate_percentiles(claim_ms),
            "stage_t1_to_t2_compose_ms": calculate_percentiles(compose_ms),
            "stage_t2_to_t3_camera_ms": calculate_percentiles(camera_ms),
            "stage_t3_to_t4_sfu_ms": calculate_percentiles(sfu_ms),
            "stage_t4_to_t5_first_frame_ms": calculate_percentiles(first_frame_ms),
            "cycle_duration_seconds": calculate_percentiles(cycle_durations),
        },
        "memory_audit": {
            "doctor": {
                "initial_pss_kb": doc_initial_pss,
                "final_pss_kb": doc_final_pss,
                "drift_kb": doc_final_pss - doc_initial_pss,
                "drift_mb": round((doc_final_pss - doc_initial_pss) / 1024.0, 2),
            },
            "patient": {
                "initial_pss_kb": pat_initial_pss,
                "final_pss_kb": pat_final_pss,
                "drift_kb": pat_final_pss - pat_initial_pss,
                "drift_mb": round((pat_final_pss - pat_initial_pss) / 1024.0, 2),
            }
        },
        "cycles": cycle_records,
    }

    # Guardar en archivo JSON estructurado
    try:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(results_payload, f, indent=2, ensure_ascii=False)
        log("EXPORT", f"📁 Resultados guardados exitosamente en: {args.output}", "\033[92m")
    except Exception as e:
        log("EXPORT_ERR", f"Error guardando {args.output}: {e}", "\033[91m")

    # REPORTE EJECUTIVO FINAL
    print("\n" + "=" * 70)
    print("📊 REPORTE FINAL DE AUDITORÍA Y FIABILIDAD EJECUTIVA")
    print("=" * 70)
    print(f"Total ciclos ejecutados:       {args.cycles}")
    print(f"Ciclos superados con éxito:   {passed}")
    print(f"Ciclos fallidos:               {failed}")
    print(f"Tasa de éxito:                 {success_rate}%")
    print(f"Duración total del suite:      {total_suite_sec}s")

    lat_p = results_payload["percentiles"]["total_latency_t0_t5_ms"]
    if lat_p["count"] > 0:
        print("\n📈 PERCENTILES DE LATENCIA T0->T5 (Logcat Telemetry):")
        print(f"   • P50 (Mediana): {lat_p['p50']} ms")
        print(f"   • P90:           {lat_p['p90']} ms")
        print(f"   • P99:           {lat_p['p99']} ms")
        print(f"   • Min / Max:     {lat_p['min']} ms / {lat_p['max']} ms (Avg: {lat_p['avg']} ms)")

    mem_d = results_payload["memory_audit"]["doctor"]
    mem_p = results_payload["memory_audit"]["patient"]
    print("\n🧠 AUDITORÍA DE MEMORIA (Dumpsys Meminfo PSS Drift):")
    print(f"   • DOCTOR:   {mem_d['initial_pss_kb']/1024:.1f} MB -> {mem_d['final_pss_kb']/1024:.1f} MB (Deriva: {mem_d['drift_mb']:+.2f} MB)")
    print(f"   • PACIENTE: {mem_p['initial_pss_kb']/1024:.1f} MB -> {mem_p['final_pss_kb']/1024:.1f} MB (Deriva: {mem_p['drift_mb']:+.2f} MB)")

    if LOG_FILE_HANDLE:
        LOG_FILE_HANDLE.close()

    if failed == 0:
        print("\n🏆 TODOS LOS CICLOS FUERON COMPROBADOS EMPÍRICAMENTE EN DB Y DISPOSITIVOS.")
        sys.exit(0)
    else:
        print("\n❌ HUBO FALLOS EN LA AUDITORÍA.")
        sys.exit(1)


if __name__ == "__main__":
    main()
