# Documentación Oficial de Ingeniería y Negocio: gentia.cl 🧠

Este documento detalla la visión comercial, arquitectura técnica, modelo de datos e ingeniería de privacidad de **Gentia.cl**, un software de gestión clínica y agendamiento serverless diseñado específicamente para psicólogos y profesionales de la salud mental en Chile.

---

## 1. Visión Estratégica y Comercial

### Misión
Democratizar el acceso a herramientas de gestión clínica y automatización digital de alta gama para profesionales de la salud mental en Chile, ofreciendo una plataforma robusta, segura y con una estructura de precios altamente competitiva que elimine las barreras de entrada tecnológica.

### Visión
Convertirse en el software de registro clínico EMR (Electronic Medical Record) y agendamiento de referencia en el mercado chileno, liderando la integración práctica de Inteligencia Artificial (transcripciones clínicas, resúmenes automáticos y epicrisis) en la terapia diaria, garantizando el cumplimiento normativo más estricto del sector.

---

## 2. Mapa Conceptual del Sistema (Concept Map)

El siguiente diagrama Mermaid esquematiza las entidades de la plataforma y su interacción en el flujo clínico y financiero:

```mermaid
graph TD
    %% Entidades principales
    subgraph Plataforma Gentia
        P[Psicólogo Profesional]
        PA[Pacientes]
        C[Citas / Agenda]
        H[Historial Clínico]
        A[Archivos Adjuntos]
    end

    subgraph Integraciones Externas
        GCal[Google Calendar & Meet]
        Resend[Resend SMTP]
        Gemini[Gemini 2.5 Flash IA]
        Webpay[Webpay Plus Transbank]
      end

    %% Relaciones
    P -->|Administra| PA
    P -->|Gestiona| C
    P -->|Conecta| GCal
    P -->|Configura| Resend

    PA -->|Contiene| H
    PA -->|Asocia| A
    PA -->|Agenda en| C

    C -->|Registra Cobro| Webpay
    C -->|Sincroniza en| GCal

    H -->|Transcribe con| Gemini
    H -->|Genera Epicrisis con| Gemini
    
    style P fill:#d1fae5,stroke:#059669,stroke-width:2px
    style PA fill:#e0f2fe,stroke:#0284c7,stroke-width:2px
    style Gemini fill:#f3e8ff,stroke:#8b5cf6,stroke-width:2px
    style Webpay fill:#fee2e2,stroke:#ef4444,stroke-width:2px
```

---

## 3. Arquitectura de Aislamiento y Privacidad (Base de Datos)

De acuerdo con la **Ley N° 20.584** (Regula los derechos y deberes que tienen las personas en relación con acciones vinculadas a su atención en salud en Chile), la ficha clínica es un documento altamente sensible y confidencial. 

Para asegurar un aislamiento absoluto entre distintos psicólogos que utilicen la plataforma (multi-tenancy), Gentia utiliza una **arquitectura de aislamiento por ruta de subcolección** en Google Cloud Firestore:

### Estructura Jerárquica NoSQL:

```
/psicologos/{psicologoId} [Documento raíz del profesional]
  ├── nombre: "Ps. Valentina Castro"
  ├── email: "valentina@correo.com"
  ├── precioOnline: 25000
  ├── precioPresencial: 35000
  ├── suscripcion: { plan: "pro", estado: "activo" }
  ├── googleTokens: { access_token: "...", refresh_token: "..." }
  │
  ├── citas/{citaId} [Subcolección de Citas]
  │     ├── pacienteId: "66666666"
  │     ├── fecha: "2026-07-15"
  │     ├── hora: "16:00"
  │     ├── precio: 25000
  │     └── estado: "confirmado"
  │
  └── pacientes/{pacienteId} [Subcolección de Pacientes]
        ├── nombre: "Tomás Valenzuela"
        ├── rut: "14.789.012-4"
        ├── telefono: "96666666"
        ├── antecedenteMed: "Diabetes"
        ├── motivoConsulta: { origen: "Derivado", manifiesto: "...", latente: "..." }
        ├── examenMental: { apariencia: "Aseado", juicio: "Conservado", insight: "Adecuado" }
        │
        ├── archivos/{archivoId} [Metadatos de documentos asociados]
        │     ├── nombre: "Consentimiento_Informado.pdf"
        │     ├── url: "https://storage.googleapis.com/..."
        │     └── tipo: "Consentimiento"
        │
        └── historial/{notaId} [Timeline de evoluciones clínicas]
              ├── contenido: "Paciente muestra avances en control de impulsos..."
              ├── tipo: "Evolución"
              ├── ansiedad: 3
              ├── depresion: 2
              ├── estres: 4
              └── createdAt: ServerTimestamp()
```

### Reglas de Seguridad Criptográficas (Firestore Rules)
El acceso directo desde el navegador del psicólogo a la base de datos está blindado por la siguiente regla en `firestore.rules`. El backend de Firebase valida que el UID de la sesión autenticada coincida exactamente con la ID del psicólogo dueño de la rama de datos:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Aislamiento completo: Solo el psicólogo dueño de la colección {psicologoId}
    // puede leer o escribir en cualquiera de sus subcolecciones secundarias.
    match /psicologos/{psicologoId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == psicologoId;
    }
  }
}
```
*Ningún psicólogo o tercero puede realizar consultas transversales (cross-tenant) a los pacientes de otro profesional.*

---

## 4. Casos de Uso y Flujos de Proceso

### Caso de Uso 1: Reserva de Cita Pública por el Paciente
Explica el flujo cuando un paciente accede a la agenda pública de un psicólogo para reservar una sesión.

```mermaid
sequenceDiagram
    actor Paciente
    participant Web as Agenda Pública (agendar.html)
    participant API as Vercel Serverless Function (/api/reservarHora)
    participant DB as Firestore
    participant GCal as Google Calendar API

    Paciente->>Web: Selecciona Fecha/Hora y completa datos
    Web->>API: POST /api/reservarHora (Datos de cita)
    Note over API: Valida disponibilidad en Firestore
    API->>DB: Crea documento de Cita en /psicologos/{id}/citas
    API->>GCal: Inserta Evento + crea enlace Google Meet
    API->>DB: Actualiza Cita con meetLink y googleEventId
    API->>Paciente: Muestra confirmación en pantalla y envía email
```

---

### Caso de Uso 2: Transcripción de Audio y Ficha de Ingreso Completa
Este flujo describe el procesamiento condicional del audio de la primera sesión combinado con el Examen Mental (V70) para generar y exportar la Ficha de Ingreso Completa en PDF.

```mermaid
flowchart TD
    Start([Psicólogo sube audio o graba sesión]) --> CheckExam{¿Paciente tiene Examen Mental?}
    
    CheckExam -- Sí --> StandardPrompt[Enviar Audio a Gemini con prompt estándar]
    
    CheckExam -- No --> ConfirmPrompt{¿Desea agregar el Examen Mental ahora?}
    
    ConfirmPrompt -- No --> StandardPrompt
    
    ConfirmPrompt -- Sí --> OpenExamModal[Cerrar nota y abrir Modal Examen Mental V70]
    OpenExamModal --> FillExam[Psicólogo rellena y guarda Examen Mental]
    FillExam --> GeminiCombinedPrompt[Enviar Audio + Examen Mental a Gemini]
    
    StandardPrompt --> CallGemini1[Gemini genera evolución + resumen corto]
    CallGemini1 --> WriteText[Rellenar notas de evolución en el dashboard]
    
    GeminiCombinedPrompt --> CallGemini2[Gemini genera evolución + resumen + Ficha de Ingreso HTML]
    CallGemini2 --> WriteTextCombined[Rellenar notas de evolución en el dashboard]
    WriteTextCombined --> MountPrint[Montar Ficha de Ingreso en Print Container]
    MountPrint --> TriggerPrint[window.print: Descargar Reporte de Ingreso PDF]
```

---

## 5. Esquema de Licenciamiento y Restricciones (Business Logic)

Para maximizar la conversión en Chile con precios competitivos, la aplicación delimita sus funciones en 3 niveles (Free, Lite, Pro):

### 1. Plan de Prueba Gratuito (Free Trial - 30 días)
*   **Límite de Pacientes**: Máximo 3 pacientes registrados en Firestore. El botón "Nuevo Paciente" se bloquea automáticamente en la interfaz.
*   **Agendamiento y Agenda**: Sí, acceso completo.
*   **Google Calendar Sync**: Sí, habilitado para probar.
*   **Funciones IA (Gemini)**: Deshabilitadas (el micrófono de transcripción y el botón de Epicrisis se ocultan de la interfaz).

### 2. Gentia Lite ($9.990 CLP/mes)
*   **Límite de Pacientes**: Sin límites.
*   **Fichas Clínicas, Examen Mental e Historial**: Sí, acceso completo.
*   **Google Calendar Sync**: Habilitado.
*   **Funciones IA (Gemini)**: Deshabilitadas.

### 3. Gentia Pro ($14.990 CLP/mes)
*   **Límite de Pacientes**: Sin límites.
*   **Google Calendar Sync**: Habilitado.
*   **Funciones IA (Gemini)**: Habilitado (Epicrisis IA, Transcripción por voz/archivo de audio, resúmenes automáticos y generación de Ficha de Ingreso).

---

## 6. Configuración de API Key de Gemini: Paso a Paso
Para usar las funciones del plan Pro, el psicólogo debe ingresar su clave API de Google Gemini en **Ajustes** -> **Preferencias y Precios**:

1.  Ingresa a la consola de **[Google AI Studio](https://aistudio.google.com/)** con tu cuenta de Google.
2.  Haz clic en el botón azul en la esquina superior izquierda: **"Get API key"** (Obtener clave de API).
3.  Haz clic en **"Create API key"** (Crear clave de API).
4.  Selecciona o crea un proyecto de Google Cloud gratuito y haz clic en **"Create API key in existing project"**.
5.  Copia la clave generada (comienza con `AIzaSy...`).
6.  Pégala en el panel de Gentia en el campo **API Key de Gemini** y presiona **Guardar Ajustes**.
