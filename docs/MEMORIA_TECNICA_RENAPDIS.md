# Memoria Técnica: Plataforma AutaMedica v0.1.0

## 1. Descripción General

AutaMedica es una plataforma integral de telemedicina y gestión de prescripciones electrónicas diseñada bajo los estándares de interoperabilidad del Ministerio de Salud de la Nación (RDIar). La solución permite la interacción segura entre médicos, pacientes y farmacias, garantizando la trazabilidad y legalidad de cada acto médico.

## 2. Arquitectura de Software e Interoperabilidad

- **Modelo de Información:** Basado íntegramente en el estándar internacional **HL7 FHIR R4**. Esto asegura que las recetas emitidas puedan ser interpretadas por otros nodos de la Red Nacional de Salud Digital.
- **Identificación de Profesionales:** Integración nativa con servicios **REFEPS** (Red Federal de Registros de Profesionales de la Salud) para la validación automática de matrículas y estados de habilitación.
- **Seguridad y Privacidad:** Cumplimiento con la **Ley 25.326** (Protección de Datos Personales). Los datos sensibles se encuentran encriptados (AES-256) y el acceso está regulado por políticas de Row Level Security (RLS).

## 3. Circuito de Prescripción y Firma

- **Firma Digital:** La plataforma soporta la integración con **Autoridades Certificantes (CA)** licenciadas (como Lakaut) para la aplicación de firmas digitales con certificados X.509, cumpliendo con los requisitos de la Ley de Recetas Electrónicas 27.553.
- **Identificación Única (CUIR):** Cada receta cuenta con una Clave Única de Identificación de Receta generada mediante algoritmos criptográficos que aseguran su unicidad.
- **Validación por QR:** Las recetas incluyen un código QR que enlaza a un validador oficial de AutaMedica, permitiendo a las farmacias verificar la autenticidad y el estado de la receta (pendiente/dispensada) sin necesidad de registros previos en la plataforma.

## 4. Repositorio de Recetas

El sistema actúa como repositorio centralizado, permitiendo que farmacias habilitadas accedan a la prescripción por pedido del paciente, garantizando la libertad de elección del establecimiento dispensador (Art. 2 Ley 25.649).
