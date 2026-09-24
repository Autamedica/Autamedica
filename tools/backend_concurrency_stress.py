#!/usr/bin/env python3
"""
Backend Concurrency & Contention Stress Suite for AutaMedica
Bombards the on-demand pharmacy dispatch engine to audit:
  1. Massive concurrent patient request bursts (20 - 50+ simultaneous requests).
  2. High-contention claim collisions (multiple doctors racing to claim the same request).
     EMPIRICAL AUDIT GATE: Zero double-assignment guarantee.
  3. Self-healing & zombie duty lock auto-recovery.
  4. SLA auto-expiration and stale request enforcement.
  5. Connection pool performance, latency distribution (P50, P90, P99), and error rates.
"""

import sys
import os
import time
import json
import uuid
import asyncio
import aiohttp
import argparse
from typing import Dict, List, Optional, Tuple, Any


def log(prefix: str, msg: str, color: str = "\033[0m"):
    ts = time.strftime("%H:%M:%S")
    print(f"{color}[{ts}][{prefix}] {msg}\033[0m", flush=True)


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


def load_env_credentials() -> Tuple[str, str]:
    """Resolves Supabase URL and Service Role Key from environment or .env files."""
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("PUBLIC_SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    search_paths = [
        "/home/edu/autamedica-pharmacy-on-demand/apps/web/.env",
        "/home/edu/autamedica-pharmacy-on-demand/.env",
        os.path.expanduser("~/.env"),
    ]

    for p in search_paths:
        if (not supabase_url or not service_key) and os.path.isfile(p):
            try:
                from dotenv import dotenv_values
                vals = dotenv_values(p)
                if not supabase_url:
                    supabase_url = vals.get("NEXT_PUBLIC_SUPABASE_URL") or vals.get("PUBLIC_SUPABASE_URL") or vals.get("SUPABASE_URL")
                if not service_key:
                    service_key = vals.get("SUPABASE_SERVICE_ROLE_KEY")
            except Exception:
                pass

    if not supabase_url or not service_key:
        raise ValueError("No se pudo resolver SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY desde el entorno o archivos .env.")

    return supabase_url.rstrip("/"), service_key


class BackendStressRunner:
    def __init__(self, base_url: str, service_key: str, concurrency_limit: int = 100):
        self.base_url = base_url
        self.service_key = service_key
        self.concurrency_limit = concurrency_limit
        self.headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        self.connector = None
        self.session = None
        self.created_request_ids: List[str] = []
        self.active_test_doctors: List[str] = []

    async def init_session(self):
        self.connector = aiohttp.TCPConnector(
            limit=self.concurrency_limit,
            limit_per_host=self.concurrency_limit,
            enable_cleanup_closed=True,
            ttl_dns_cache=300
        )
        self.session = aiohttp.ClientSession(
            connector=self.connector,
            headers=self.headers,
            timeout=aiohttp.ClientTimeout(total=45.0, connect=10.0)
        )

    async def close_session(self):
        if self.session and not self.session.closed:
            await self.session.close()
        if self.connector and not self.connector.closed:
            await self.connector.close()

    async def fetch_available_doctors(self, count: int) -> List[str]:
        """Retrieves active doctor IDs from public.doctors to use in concurrency stress tests."""
        url = f"{self.base_url}/rest/v1/doctors?select=id,specialty&active=eq.true&limit={max(count, 10)}"
        async with self.session.get(url) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise RuntimeError(f"Error fetching doctors ({resp.status}): {text}")
            data = await resp.json()
            doc_ids = [d["id"] for d in data if d.get("id")]
            if len(doc_ids) < count:
                raise RuntimeError(f"Se requieren {count} médicos activos, pero solo se encontraron {len(doc_ids)} en public.doctors.")
            return doc_ids[:count]

    async def setup_doctors_duty(self, doctor_ids: List[str]):
        """Sets doctor_duty_status for test doctors to on-duty, cleared active request, and fresh heartbeat."""
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        tasks = []
        for doc_id in doctor_ids:
            duty_payload = {
                "doctor_id": doc_id,
                "is_on_duty": True,
                "active_tiers": ["general"],
                "current_active_request_id": None,
                "last_heartbeat_at": now_iso,
                "updated_at": now_iso,
            }
            url = f"{self.base_url}/rest/v1/doctor_duty_status"
            headers_upsert = {**self.headers, "Prefer": "resolution=merge-duplicates"}
            tasks.append(self.session.post(url, headers=headers_upsert, json=duty_payload))

        responses = await asyncio.gather(*tasks, return_exceptions=True)
        for i, r in enumerate(responses):
            if isinstance(r, Exception) or (hasattr(r, "status") and r.status not in (200, 201)):
                status_code = getattr(r, "status", "EXC")
                log("DUTY_SETUP_WARN", f"Fallo al configurar guardia médica para {doctor_ids[i]} (status={status_code})", "\033[93m")

        self.active_test_doctors = list(set(self.active_test_doctors + doctor_ids))

    async def release_all_doctors_duty(self, doctor_ids: List[str]):
        """Releases duty locks for test doctors."""
        tasks = []
        for doc_id in doctor_ids:
            url = f"{self.base_url}/rest/v1/rpc/finish_pharmacy_consultation"
            tasks.append(self.session.post(url, json={"p_doctor_id": doc_id}))
        await asyncio.gather(*tasks, return_exceptions=True)

    # =========================================================================
    # VECTOR A: MASSIVE CONCURRENT PATIENT REQUEST BURST
    # =========================================================================
    async def run_patient_burst_test(self, num_patients: int = 30) -> Dict[str, Any]:
        log("BURST", f"🚀 INICIANDO RÁFAGA CONCURRENTE DE {num_patients} PACIENTES...", "\033[1m\033[96m")
        latencies_ms: List[float] = []
        success_count = 0
        error_count = 0
        created_ids: List[str] = []

        async def create_single_patient(idx: int) -> Tuple[bool, float, Optional[str], Optional[str]]:
            t0 = time.perf_counter()
            dni = f"99{idx:06d}"
            phone = f"+5491199{idx:06d}"
            room_id = f"cf-room-stress-burst-{uuid.uuid4().hex[:10]}"
            payload = {
                "patient_dni": dni,
                "patient_phone": phone,
                "patient_name": f"Stress Patient #{idx}",
                "tier_requested": "general",
                "cloudflare_room_id": room_id,
                "status": "searching",
                "symptom_summary": f"Stress burst request #{idx}",
            }
            url = f"{self.base_url}/rest/v1/pharmacy_dispatch_requests"
            try:
                async with self.session.post(url, json=payload) as resp:
                    elapsed_ms = (time.perf_counter() - t0) * 1000.0
                    if resp.status == 201:
                        data = await resp.json()
                        req_id = data[0]["id"] if data else None
                        return True, elapsed_ms, req_id, None
                    else:
                        text = await resp.text()
                        return False, elapsed_ms, None, f"HTTP {resp.status}: {text[:100]}"
            except Exception as e:
                elapsed_ms = (time.perf_counter() - t0) * 1000.0
                return False, elapsed_ms, None, str(e)

        t_burst_start = time.perf_counter()
        results = await asyncio.gather(*[create_single_patient(i) for i in range(1, num_patients + 1)])
        total_burst_sec = time.perf_counter() - t_burst_start

        for ok, lat, req_id, err in results:
            latencies_ms.append(lat)
            if ok and req_id:
                success_count += 1
                created_ids.append(req_id)
                self.created_request_ids.append(req_id)
            else:
                error_count += 1
                log("BURST_FAIL", f"Fallo en inserción: {err}", "\033[91m")

        pcts = calculate_percentiles(latencies_ms)
        throughput = round(num_patients / total_burst_sec, 2) if total_burst_sec > 0 else 0.0

        # Verificación en BD: confirmar presencia de las solicitudes
        verify_url = f"{self.base_url}/rest/v1/pharmacy_dispatch_requests?id=in.({','.join(created_ids)})&select=id,status"
        db_verified_count = 0
        if created_ids:
            async with self.session.get(verify_url) as v_resp:
                if v_resp.status == 200:
                    v_data = await v_resp.json()
                    db_verified_count = len(v_data)

        log("BURST", f"✅ RÁFAGA COMPLETADA: {success_count}/{num_patients} exitosas en {total_burst_sec:.2f}s ({throughput} req/s)", "\033[92m")
        log("BURST_LATENCY", f"   • Inserción P50: {pcts['p50']}ms | P90: {pcts['p90']}ms | P99: {pcts['p99']}ms | Avg: {pcts['avg']}ms", "\033[96m")
        log("BURST_AUDIT", f"   • Verificadas en Base de Datos: {db_verified_count}/{success_count}", "\033[92m" if db_verified_count == success_count else "\033[91m")

        return {
            "test_name": "patient_burst",
            "requested_patients": num_patients,
            "successful_inserts": success_count,
            "failed_inserts": error_count,
            "db_verified_count": db_verified_count,
            "total_duration_seconds": round(total_burst_sec, 2),
            "throughput_req_per_sec": throughput,
            "latency_percentiles_ms": pcts,
            "created_request_ids": created_ids,
            "passed": (success_count == num_patients and db_verified_count == success_count)
        }

    # =========================================================================
    # VECTOR B: HIGH-CONTENTION CLAIM COLLISIONS (ZERO DOUBLE-ASSIGNMENT GATE)
    # =========================================================================
    async def run_claim_collision_test(
        self,
        num_contenders: int = 5,
        num_trials: int = 10
    ) -> Dict[str, Any]:
        log("COLLISION", f"⚔️ INICIANDO AUDITORÍA DE COLISIONES ({num_trials} ensayos x {num_contenders} médicos compitiendo simultáneamente)...", "\033[1m\033[95m")

        doctors = await self.fetch_available_doctors(num_contenders)
        log("COLLISION", f"Médicos asignados a la contienda: {doctors}", "\033[95m")
        await self.setup_doctors_duty(doctors)

        trial_results: List[Dict[str, Any]] = []
        resolution_latencies_ms: List[float] = []
        zero_double_assignment_violations = 0

        for trial_num in range(1, num_trials + 1):
            # 1. Liberar guardia de todos los médicos antes de la contienda
            await self.release_all_doctors_duty(doctors)
            await self.setup_doctors_duty(doctors)

            # 2. Crear solicitud fresca en estado 'searching'
            room_id = f"cf-room-collision-trial-{trial_num}-{uuid.uuid4().hex[:8]}"
            req_payload = {
                "patient_dni": f"88{trial_num:06d}",
                "patient_phone": f"+5491188{trial_num:06d}",
                "patient_name": f"Trial Patient #{trial_num}",
                "tier_requested": "general",
                "cloudflare_room_id": room_id,
                "status": "searching",
                "symptom_summary": f"Claim collision test trial #{trial_num}",
            }
            async with self.session.post(f"{self.base_url}/rest/v1/pharmacy_dispatch_requests", json=req_payload) as r_resp:
                if r_resp.status != 201:
                    log("COLLISION_FAIL", f"No se pudo crear solicitud para ensayo #{trial_num}", "\033[91m")
                    continue
                r_data = await r_resp.json()
                req_id = r_data[0]["id"]
                self.created_request_ids.append(req_id)

            # 3. Lanzar la carrera sincronizada
            start_event = asyncio.Event()

            async def doctor_claim_runner(doc_id: str) -> Dict[str, Any]:
                await start_event.wait()  # Sincronización exacta en microsegundos
                t0 = time.perf_counter()
                url = f"{self.base_url}/rest/v1/rpc/claim_pharmacy_request_tier"
                payload = {
                    "p_request_id": req_id,
                    "p_doctor_id": doc_id,
                }
                try:
                    async with self.session.post(url, json=payload) as c_resp:
                        elapsed_ms = (time.perf_counter() - t0) * 1000.0
                        body = await c_resp.json()
                        return {
                            "doctor_id": doc_id,
                            "status_code": c_resp.status,
                            "response": body,
                            "latency_ms": elapsed_ms,
                            "success": body.get("success", False),
                            "code": body.get("code")
                        }
                except Exception as e:
                    elapsed_ms = (time.perf_counter() - t0) * 1000.0
                    return {
                        "doctor_id": doc_id,
                        "status_code": 500,
                        "response": str(e),
                        "latency_ms": elapsed_ms,
                        "success": False,
                        "code": "EXCEPTION"
                    }

            tasks = [asyncio.create_task(doctor_claim_runner(doc_id)) for doc_id in doctors]
            await asyncio.sleep(0.01)  # Asegura que todas las tareas alcancen await start_event.wait()
            start_event.set()  # Disparador atómico simultáneo
            contenders_out = await asyncio.gather(*tasks)

            # 4. AUDITORÍA EMPÍRICA RIGUROSA DE RESULTADOS
            winners = [c for c in contenders_out if c["success"] is True and c["code"] == "MATCH_SUCCESSFUL"]
            losers = [c for c in contenders_out if c["success"] is False]
            max_lat = max([c["latency_ms"] for c in contenders_out])
            resolution_latencies_ms.append(max_lat)

            # Verificación del estado en la Base de Datos
            verify_url = f"{self.base_url}/rest/v1/pharmacy_dispatch_requests?id=eq.{req_id}&select=id,status,assigned_doctor_id,matched_at"
            db_assigned_doc = None
            db_status = None
            async with self.session.get(verify_url) as v_resp:
                if v_resp.status == 200:
                    v_data = await v_resp.json()
                    if v_data:
                        db_assigned_doc = v_data[0].get("assigned_doctor_id")
                        db_status = v_data[0].get("status")

            # REGLA ZERO-DOUBLE-ASSIGNMENT:
            # Debe haber EXACTAMENTE 1 ganador, y el ID en la BD debe coincidir estrictamente
            is_atomic = (len(winners) == 1 and
                         db_status in ("matched", "in_call") and
                         db_assigned_doc == winners[0]["doctor_id"])

            if not is_atomic:
                zero_double_assignment_violations += 1
                log("RACE_CONDITION_FAIL", f"❌ VIOLACIÓN CRÍTICA EN ENSAYO #{trial_num}: Ganadores={len(winners)} (esperado 1) | DB doc={db_assigned_doc}", "\033[1m\033[91m")
            else:
                winning_doc = winners[0]["doctor_id"]
                log("COLLISION_PASS", f"✅ Ensayo #{trial_num}/{num_trials} SUPERADO: Ganador único={winning_doc[:8]}... | {len(losers)} rechazados en {max_lat:.1f}ms", "\033[92m")

            trial_results.append({
                "trial_number": trial_num,
                "request_id": req_id,
                "contenders_count": num_contenders,
                "winners_count": len(winners),
                "winning_doctor_id": winners[0]["doctor_id"] if winners else None,
                "db_assigned_doctor_id": db_assigned_doc,
                "db_status": db_status,
                "is_atomic": is_atomic,
                "max_resolution_latency_ms": round(max_lat, 2),
                "losers_codes": [l["code"] for l in losers],
            })

            # Pequeña pausa entre ensayos
            await asyncio.sleep(0.3)

        # Liberar guardia final
        await self.release_all_doctors_duty(doctors)

        collision_pcts = calculate_percentiles(resolution_latencies_ms)
        success_rate = round(((num_trials - zero_double_assignment_violations) / num_trials) * 100.0, 2)

        print("-" * 65)
        log("COLLISION_REPORT", f"📊 RESUMEN AUDITORÍA DE COLISIÓN ({num_trials} ENSAYOS):", "\033[1m\033[95m")
        log("COLLISION_REPORT", f"   • Tasa de Cero Doble Asignación: {success_rate}%", "\033[92m" if zero_double_assignment_violations == 0 else "\033[91m")
        log("COLLISION_REPORT", f"   • Violaciones de Concurrencia:    {zero_double_assignment_violations}", "\033[92m" if zero_double_assignment_violations == 0 else "\033[91m")
        log("COLLISION_REPORT", f"   • Latencia de Resolución P50:    {collision_pcts['p50']}ms | P90: {collision_pcts['p90']}ms | P99: {collision_pcts['p99']}ms", "\033[96m")
        print("-" * 65)

        return {
            "test_name": "claim_collisions",
            "trials_count": num_trials,
            "contenders_per_trial": num_contenders,
            "zero_double_assignment_violations": zero_double_assignment_violations,
            "success_rate_percent": success_rate,
            "resolution_latency_percentiles_ms": collision_pcts,
            "trial_details": trial_results,
            "passed": (zero_double_assignment_violations == 0)
        }

    # =========================================================================
    # VECTOR C: SELF-HEALING & ZOMBIE LOCK RECOVERY
    # =========================================================================
    async def run_self_healing_test(self) -> Dict[str, Any]:
        log("SELF_HEAL", "🛡️ INICIANDO VALIDACIÓN DE AUTO-RECUPERACIÓN (SELF-HEALING) ANTE BLOQUEOS ZOMBIES...", "\033[1m\033[93m")

        doctors = await self.fetch_available_doctors(1)
        doc_id = doctors[0]
        await self.setup_doctors_duty([doc_id])

        cases_passed = 0
        total_cases = 3
        subtest_details = []

        # Caso 1: Bloqueo zombie hacia una consulta previa que ya está en estado 'completed'
        log("SELF_HEAL", "1. Provocando bloqueo zombie hacia consulta en estado 'completed'...", "\033[93m")
        # Crear consulta previa completada
        req_prev_payload = {
            "patient_dni": "77000001",
            "patient_phone": "+5491177000001",
            "patient_name": "Zombie Patient 1",
            "tier_requested": "general",
            "cloudflare_room_id": f"cf-room-zombie-1-{uuid.uuid4().hex[:6]}",
            "status": "completed",
            "call_ended_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        async with self.session.post(f"{self.base_url}/rest/v1/pharmacy_dispatch_requests", json=req_prev_payload) as p_resp:
            p_data = await p_resp.json()
            prev_req_id = p_data[0]["id"]
            self.created_request_ids.append(prev_req_id)

        # Inyectar el bloqueo zombie en doctor_duty_status
        await self.session.patch(
            f"{self.base_url}/rest/v1/doctor_duty_status?doctor_id=eq.{doc_id}",
            json={"current_active_request_id": prev_req_id, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        )

        # Crear nueva solicitud legítima
        req_new_payload = {
            "patient_dni": "77000002",
            "patient_phone": "+5491177000002",
            "patient_name": "Fresh Patient 1",
            "tier_requested": "general",
            "cloudflare_room_id": f"cf-room-fresh-1-{uuid.uuid4().hex[:6]}",
            "status": "searching"
        }
        async with self.session.post(f"{self.base_url}/rest/v1/pharmacy_dispatch_requests", json=req_new_payload) as n_resp:
            n_data = await n_resp.json()
            new_req_id = n_data[0]["id"]
            self.created_request_ids.append(new_req_id)

        # El médico intenta adjudicarse la nueva solicitud: la RPC debe auto-sanar el bloqueo zombie
        async with self.session.post(
            f"{self.base_url}/rest/v1/rpc/claim_pharmacy_request_tier",
            json={"p_request_id": new_req_id, "p_doctor_id": doc_id}
        ) as claim_resp:
            res_c1 = await claim_resp.json()
            ok_c1 = res_c1.get("success") is True and res_c1.get("code") == "MATCH_SUCCESSFUL"
            if ok_c1:
                cases_passed += 1
                log("SELF_HEAL", f"✅ Caso 1 Superado: Bloqueo zombie hacia 'completed' auto-recuperado con éxito.", "\033[92m")
            else:
                log("SELF_HEAL", f"❌ Caso 1 Falló: No se auto-sanó ({res_c1})", "\033[91m")
            subtest_details.append({"case": "zombie_completed_request", "passed": ok_c1, "response": res_c1})

        await self.release_all_doctors_duty([doc_id])

        # Caso 2: Bloqueo zombie hacia una consulta abandonada (matched hace >60s sin inicio de video)
        log("SELF_HEAL", "2. Provocando bloqueo zombie por abandono (matched > 60s sin video)...", "\033[93m")
        stale_time_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 90))
        req_aband_payload = {
            "patient_dni": "77000003",
            "patient_phone": "+5491177000003",
            "patient_name": "Zombie Patient 2",
            "tier_requested": "general",
            "cloudflare_room_id": f"cf-room-zombie-2-{uuid.uuid4().hex[:6]}",
            "status": "matched",
            "matched_at": stale_time_iso,
            "call_started_at": None
        }
        async with self.session.post(f"{self.base_url}/rest/v1/pharmacy_dispatch_requests", json=req_aband_payload) as a_resp:
            a_data = await a_resp.json()
            aband_req_id = a_data[0]["id"]
            self.created_request_ids.append(aband_req_id)

        await self.session.patch(
            f"{self.base_url}/rest/v1/doctor_duty_status?doctor_id=eq.{doc_id}",
            json={"is_on_duty": True, "current_active_request_id": aband_req_id, "updated_at": stale_time_iso}
        )

        req_fresh2_payload = {
            "patient_dni": "77000004",
            "patient_phone": "+5491177000004",
            "patient_name": "Fresh Patient 2",
            "tier_requested": "general",
            "cloudflare_room_id": f"cf-room-fresh-2-{uuid.uuid4().hex[:6]}",
            "status": "searching"
        }
        async with self.session.post(f"{self.base_url}/rest/v1/pharmacy_dispatch_requests", json=req_fresh2_payload) as f2_resp:
            f2_data = await f2_resp.json()
            fresh2_id = f2_data[0]["id"]
            self.created_request_ids.append(fresh2_id)

        async with self.session.post(
            f"{self.base_url}/rest/v1/rpc/claim_pharmacy_request_tier",
            json={"p_request_id": fresh2_id, "p_doctor_id": doc_id}
        ) as claim_resp2:
            res_c2 = await claim_resp2.json()
            ok_c2 = res_c2.get("success") is True and res_c2.get("code") == "MATCH_SUCCESSFUL"
            if ok_c2:
                cases_passed += 1
                log("SELF_HEAL", f"✅ Caso 2 Superado: Match abandonado auto-cancelado y médico liberado para nueva consulta.", "\033[92m")
            else:
                log("SELF_HEAL", f"❌ Caso 2 Falló: Abandono no recuperado ({res_c2})", "\033[91m")
            subtest_details.append({"case": "zombie_abandoned_match", "passed": ok_c2, "response": res_c2})

        await self.release_all_doctors_duty([doc_id])

        # Caso 3: Bloqueo huérfano (ID inexistente en tabla de requests)
        log("SELF_HEAL", "3. Provocando bloqueo huérfano (UUID inexistente en requests)...", "\033[93m")
        orphan_id = str(uuid.uuid4())
        await self.session.patch(
            f"{self.base_url}/rest/v1/doctor_duty_status?doctor_id=eq.{doc_id}",
            json={"is_on_duty": True, "current_active_request_id": orphan_id}
        )

        req_fresh3_payload = {
            "patient_dni": "77000005",
            "patient_phone": "+5491177000005",
            "patient_name": "Fresh Patient 3",
            "tier_requested": "general",
            "cloudflare_room_id": f"cf-room-fresh-3-{uuid.uuid4().hex[:6]}",
            "status": "searching"
        }
        async with self.session.post(f"{self.base_url}/rest/v1/pharmacy_dispatch_requests", json=req_fresh3_payload) as f3_resp:
            f3_data = await f3_resp.json()
            fresh3_id = f3_data[0]["id"]
            self.created_request_ids.append(fresh3_id)

        async with self.session.post(
            f"{self.base_url}/rest/v1/rpc/claim_pharmacy_request_tier",
            json={"p_request_id": fresh3_id, "p_doctor_id": doc_id}
        ) as claim_resp3:
            res_c3 = await claim_resp3.json()
            ok_c3 = res_c3.get("success") is True and res_c3.get("code") == "MATCH_SUCCESSFUL"
            if ok_c3:
                cases_passed += 1
                log("SELF_HEAL", f"✅ Caso 3 Superado: Bloqueo huérfano auto-sanado y nueva consulta adjudicada.", "\033[92m")
            else:
                log("SELF_HEAL", f"❌ Caso 3 Falló: Bloqueo huérfano persistió ({res_c3})", "\033[91m")
            subtest_details.append({"case": "zombie_orphan_uuid", "passed": ok_c3, "response": res_c3})

        await self.release_all_doctors_duty([doc_id])

        log("SELF_HEAL", f"📊 RESUMEN SELF-HEALING: {cases_passed}/{total_cases} casos verificados exitosamente.", "\033[92m" if cases_passed == total_cases else "\033[91m")

        return {
            "test_name": "self_healing_zombie_locks",
            "cases_tested": total_cases,
            "cases_passed": cases_passed,
            "details": subtest_details,
            "passed": (cases_passed == total_cases)
        }

    # =========================================================================
    # VECTOR D: SLA AUTO-EXPIRATION VALIDATION
    # =========================================================================
    async def run_expiration_test(self) -> Dict[str, Any]:
        log("EXPIRATION", "⏳ INICIANDO VALIDACIÓN DE AUTO-EXPIRACIÓN DE SLA...", "\033[1m\033[94m")

        doctors = await self.fetch_available_doctors(1)
        doc_id = doctors[0]
        await self.setup_doctors_duty([doc_id])

        # Crear solicitud con timeout muy corto (1.5 segundos)
        short_timeout_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 1))
        req_payload = {
            "patient_dni": "66000001",
            "patient_phone": "+5491166000001",
            "patient_name": "SLA Timeout Patient",
            "tier_requested": "general",
            "cloudflare_room_id": f"cf-room-sla-exp-{uuid.uuid4().hex[:6]}",
            "status": "searching",
            "search_timeout_at": short_timeout_iso,
        }

        async with self.session.post(f"{self.base_url}/rest/v1/pharmacy_dispatch_requests", json=req_payload) as resp:
            data = await resp.json()
            req_id = data[0]["id"]
            self.created_request_ids.append(req_id)

        log("EXPIRATION", f"Solicitud creada con timeout en {short_timeout_iso}. Esperando 2.5s para forzar expiración...", "\033[94m")
        await asyncio.sleep(2.5)

        # Intentar adjudicación de solicitud vencida
        claim_url = f"{self.base_url}/rest/v1/rpc/claim_pharmacy_request_tier"
        async with self.session.post(claim_url, json={"p_request_id": req_id, "p_doctor_id": doc_id}) as c_resp:
            c_data = await c_resp.json()
            claim_rejected = c_data.get("success") is False and c_data.get("code") == "REQUEST_ALREADY_CLAIMED_OR_EXPIRED"

        # Verificar en base de datos que el estado haya mutado a 'expired'
        verify_url = f"{self.base_url}/rest/v1/pharmacy_dispatch_requests?id=eq.{req_id}&select=status"
        db_status = None
        async with self.session.get(verify_url) as v_resp:
            v_data = await v_resp.json()
            if v_data:
                db_status = v_data[0].get("status")

        await self.release_all_doctors_duty([doc_id])

        exp_ok = claim_rejected and (db_status == "expired")
        if exp_ok:
            log("EXPIRATION", f"✅ AUTO-EXPIRACIÓN CONFIRMADA: Reclamo denegado ({c_data.get('code')}) y status='{db_status}' en BD.", "\033[92m")
        else:
            log("EXPIRATION", f"❌ FALLO EN AUTO-EXPIRACIÓN: rejected={claim_rejected}, db_status={db_status}", "\033[91m")

        return {
            "test_name": "sla_auto_expiration",
            "request_id": req_id,
            "claim_rejected": claim_rejected,
            "claim_response": c_data,
            "final_db_status": db_status,
            "passed": exp_ok
        }

    # =========================================================================
    # CLEANUP ROUTINE
    # =========================================================================
    async def cleanup(self):
        log("CLEANUP", f"🧹 Limpiando {len(self.created_request_ids)} solicitudes de prueba creadas en Supabase...", "\033[93m")
        if self.created_request_ids:
            chunk_size = 50
            for i in range(0, len(self.created_request_ids), chunk_size):
                chunk = self.created_request_ids[i:i + chunk_size]
                url = f"{self.base_url}/rest/v1/pharmacy_dispatch_requests?id=in.({','.join(chunk)})"
                try:
                    async with self.session.delete(url) as resp:
                        pass
                except Exception:
                    pass

        if self.active_test_doctors:
            await self.release_all_doctors_duty(self.active_test_doctors)

        log("CLEANUP", "✅ Limpieza de solicitudes de prueba y guardias completada.", "\033[92m")


async def main_async():
    parser = argparse.ArgumentParser(
        description="Backend Concurrency & Contention Stress Suite for AutaMedica",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--supabase-url", default=None, help="URL de Supabase (default: .env)")
    parser.add_argument("--service-key", default=None, help="Service Role Key de Supabase (default: .env)")
    parser.add_argument("--patients", "-p", type=int, default=30, help="Número de pacientes concurrentes en la ráfaga (20 a 50+)")
    parser.add_argument("--claim-doctors", "-d", type=int, default=5, help="Número de médicos simultáneos en contienda de colisión")
    parser.add_argument("--collision-trials", "-t", type=int, default=5, help="Número de ensayos de colisión de claim")
    parser.add_argument("--test", choices=["all", "burst", "collision", "self-healing", "expiration"], default="all", help="Sub-suite específico a ejecutar")
    parser.add_argument("--output", "-o", default="results_backend_stress.json", help="Ruta para exportar métricas JSON estructuradas")
    parser.add_argument("--concurrency-limit", type=int, default=100, help="Límite del pool de conexiones TCP en aiohttp")
    parser.add_argument("--no-cleanup", action="store_true", help="Omitir eliminación de filas de prueba en pharmacy_dispatch_requests")

    args = parser.parse_args()

    # Resolver credenciales
    if args.supabase_url and args.service_key:
        url, key = args.supabase_url.rstrip("/"), args.service_key
    else:
        url, key = load_env_credentials()

    runner = BackendStressRunner(url, key, concurrency_limit=args.concurrency_limit)
    await runner.init_session()

    print("\n" + "=" * 70)
    print("🔥 SUITE DE ESTRÉS DE CONCURRENCIA BACKEND AUTAMEDICA")
    print(f"   • Supabase Target:     {url}")
    print(f"   • Ráfaga Pacientes:    {args.patients}")
    print(f"   • Médicos en Carrera:  {args.claim_doctors}")
    print(f"   • Ensayos Colisión:    {args.collision_trials}")
    print(f"   • Sub-suite:           {args.test}")
    print(f"   • Reporte Salida:      {args.output}")
    print("=" * 70)

    t_suite_start = time.perf_counter()
    report: Dict[str, Any] = {
        "metadata": {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "supabase_url": url,
            "patients_configured": args.patients,
            "claim_doctors_configured": args.claim_doctors,
            "collision_trials_configured": args.collision_trials,
            "selected_test": args.test,
            "concurrency_limit": args.concurrency_limit,
        },
        "results": {},
        "summary": {
            "all_passed": True,
            "failed_tests": []
        }
    }

    try:
        if args.test in ("all", "burst"):
            res_burst = await runner.run_patient_burst_test(num_patients=args.patients)
            report["results"]["burst_test"] = res_burst
            if not res_burst["passed"]:
                report["summary"]["all_passed"] = False
                report["summary"]["failed_tests"].append("burst_test")

        if args.test in ("all", "collision"):
            res_collision = await runner.run_claim_collision_test(
                num_contenders=args.claim_doctors,
                num_trials=args.collision_trials
            )
            report["results"]["collision_test"] = res_collision
            if not res_collision["passed"]:
                report["summary"]["all_passed"] = False
                report["summary"]["failed_tests"].append("collision_test")

        if args.test in ("all", "self-healing"):
            res_healing = await runner.run_self_healing_test()
            report["results"]["self_healing_test"] = res_healing
            if not res_healing["passed"]:
                report["summary"]["all_passed"] = False
                report["summary"]["failed_tests"].append("self_healing_test")

        if args.test in ("all", "expiration"):
            res_exp = await runner.run_expiration_test()
            report["results"]["expiration_test"] = res_exp
            if not res_exp["passed"]:
                report["summary"]["all_passed"] = False
                report["summary"]["failed_tests"].append("expiration_test")

    finally:
        if not args.no_cleanup:
            await runner.cleanup()
        await runner.close_session()

    report["metadata"]["suite_duration_seconds"] = round(time.perf_counter() - t_suite_start, 2)

    # Guardar reporte JSON estructurado
    try:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        log("EXPORT", f"📁 Reporte de estrés guardado en: {args.output}", "\033[92m")
    except Exception as e:
        log("EXPORT_ERR", f"Error guardando {args.output}: {e}", "\033[91m")

    print("\n" + "=" * 70)
    print("🏁 REPORTE FINAL DE AUDITORÍA DE CONCURRENCIA BACKEND")
    print("=" * 70)
    for test_key, data in report["results"].items():
        state_str = "✅ SUPERADO" if data.get("passed") else "❌ FALLIDO"
        print(f"  • {test_key.upper():<25}: {state_str}")

    print(f"\nDuración total: {report['metadata']['suite_duration_seconds']}s")
    if report["summary"]["all_passed"]:
        print("🏆 TODAS LAS AUDITORÍAS DE CONCURRENCIA, ATOMICIDAD Y RESILIENCIA PASARON AL 100%.")
        sys.exit(0)
    else:
        print(f"❌ FALLOS DETECTADOS EN: {report['summary']['failed_tests']}")
        sys.exit(1)


def main():
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        print("\n[!] Suite interrumpido por el usuario.")
        sys.exit(130)


if __name__ == "__main__":
    main()
