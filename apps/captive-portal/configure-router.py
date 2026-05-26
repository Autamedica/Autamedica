#!/usr/bin/env python3
"""
Sagemcom Router DNS Configuration Script
Attempts to set DHCP DNS to 192.168.0.2 via the Sagemcom API
"""
import asyncio
import sys
from sagemcom_api.client import SagemcomClient
from sagemcom_api.enums import EncryptionMethod
from aiohttp import ClientSession, TCPConnector

ROUTER_IP = "192.168.0.1"
USERNAME = "admin"
PASSWORD = "NMN4KZYK"
TARGET_DNS = "192.168.0.2"

async def main():
    async with ClientSession(connector=TCPConnector(verify_ssl=False)) as session:
        client = SagemcomClient(
            host=ROUTER_IP,
            username=USERNAME,
            password=PASSWORD,
            authentication_method=EncryptionMethod.SHA512,
            session=session,
            ssl=True,
            verify_ssl=False,
        )

        print(f"🔌 Conectando a {ROUTER_IP}...")

        try:
            await client.login()
            print("✅ Login exitoso!")
        except Exception as e:
            print(f"❌ Login falló con SHA512, probando MD5...")
            try:
                client = SagemcomClient(
                    host=ROUTER_IP,
                    username=USERNAME,
                    password=PASSWORD,
                    authentication_method=EncryptionMethod.MD5,
                    session=session,
                    ssl=True,
                    verify_ssl=False,
                )
                await client.login()
                print("✅ Login exitoso con MD5!")
            except Exception as e2:
                print(f"❌ Login falló también con MD5: {e2}")
                print("Probando sin SSL...")
                try:
                    client = SagemcomClient(
                        host=ROUTER_IP,
                        username=USERNAME,
                        password=PASSWORD,
                        authentication_method=EncryptionMethod.MD5,
                        session=session,
                        ssl=False,
                    )
                    await client.login()
                    print("✅ Login exitoso sin SSL!")
                except Exception as e3:
                    print(f"❌ Todos los métodos de login fallaron: {e3}")
                    return

        # Get device info
        print("\n📋 Información del dispositivo:")
        try:
            info = await client.get_device_info()
            print(f"  Modelo: {info.model_name}")
            print(f"  Serial: {info.serial_number}")
            print(f"  Firmware: {info.software_version}")
            print(f"  MAC: {info.mac_address}")
        except Exception as e:
            print(f"  ⚠️ No pudo obtener info: {e}")

        # Try to read current DNS settings
        print("\n🔍 Buscando configuración DNS actual...")
        dns_xpaths = [
            "Device/DHCPv4/Server/Pool/1/DNSServers",
            "Device/DHCPv4/Server/Pools/Pool[@uid='1']/DNSServers",
            "Device/DNS/Client/Server",
            "Device/DHCPv4/Server/Pool/1",
            "Device/Services/Networking/DHCPServer/DHCPServerPool/1/DNSServers",
        ]

        for xpath in dns_xpaths:
            try:
                value = await client.get_value_by_xpath(xpath)
                print(f"  ✅ {xpath} = {value}")
            except Exception as e:
                print(f"  ❌ {xpath}: {e}")

        # Try to set DNS
        print(f"\n⚙️ Intentando configurar DNS a {TARGET_DNS}...")
        set_xpaths = [
            "Device/DHCPv4/Server/Pool/1/DNSServers",
            "Device/DHCPv4/Server/Pools/Pool[@uid='1']/DNSServers",
        ]

        for xpath in set_xpaths:
            try:
                await client.set_value_by_xpath(xpath, f"{TARGET_DNS},1.1.1.1")
                print(f"  ✅ DNS configurado via {xpath}!")
                break
            except Exception as e:
                print(f"  ❌ {xpath}: {e}")

        await client.logout()
        print("\n🔌 Desconectado del router.")

if __name__ == "__main__":
    asyncio.run(main())
