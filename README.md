# gentia.cl 🧠 - Plataforma de Gestión Clínica y Agendamiento para Psicólogos

Gentia es una plataforma SaaS multi-inquilino (multi-tenant) diseñada específicamente para psicólogos y profesionales de la salud mental en Chile. Permite administrar pacientes, registrar notas de evolución clínica, medir métricas de bienestar y automatizar recordatorios de pago y citas con una arquitectura 100% serverless, segura y con costo de infraestructura de **$0 USD**.

---

## ✨ Características Principales

*   **Agendamiento Público Personalizado**: Cada psicólogo dispone de un enlace único (ej. `gentia.cl/agendar.html?id=UID`) para que sus pacientes puedan agendar horas de forma directa según su disponibilidad.
*   **Fichas Clínicas Seguras**: Gestión del perfil del paciente, antecedentes médicos y psiquiátricos, y banderas de alertas críticas (Riesgo suicida, VIF, Abuso).
*   **Historial de Evolución con Métricas**: Registro de notas confidenciales por sesión, acompañadas de indicadores numéricos (0-10) de Ansiedad, Depresión y Estrés para evaluar el progreso en gráficos o alertas tempranas.
*   **Documentos Adjuntos**: Capacidad de asociar archivos PDF (consentimientos informados, informes) a la ficha del paciente.
*   **Integración con Google Calendar**: Sincronización en tiempo real de citas. Crea automáticamente eventos en el calendario del psicólogo con enlaces dinámicos a salas de **Google Meet** si la sesión es online.
*   **Recordatorios de Pago y Sesiones**: Envío de correos electrónicos automáticos o manuales con plantillas profesionales y los datos de transferencia bancaria personalizados del profesional.
*   **Aislamiento de Datos por Ley de Derechos del Paciente**: Reglas criptográficas y lógicas que impiden el acceso a los historiales clínicos entre distintos profesionales.

---

## 🛠️ Tecnologías Utilizadas

1.  **Frontend**: HTML5, Vanilla CSS3 (diseño moderno, responsive y con efectos glassmorphic) y JavaScript Vanilla (Firebase Web SDK v10 modular).
2.  **Backend (API)**: Express y TypeScript, ejecutados como **Serverless Functions en Vercel**.
3.  **Base de Datos**: **Cloud Firestore** de Firebase (NoSQL).
4.  **Autenticación**: **Firebase Authentication** (Soporta inicio de sesión clásico y Google OAuth).
5.  **Envío de Correos**: **Resend SMTP API**.

---

## 🔒 Reglas de Seguridad y Privacidad (Firestore Rules)

Para cumplir con la privacidad de los datos de salud mental de los pacientes, el proyecto utiliza la estructura de aislamiento por subcolecciones, asegurando que un psicólogo autenticado únicamente tenga permisos para leer/escribir datos que pertenezcan a su propia ID (`psicologoId`):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /psicologos/{psicologoId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == psicologoId;
    }
  }
}
```

---

## 🚀 Guía de Instalación y Pruebas Locales

### Requisitos Previos
*   Node.js (versión 18 o superior)
*   Una cuenta activa de Firebase (Plan Spark) y Vercel (Plan Hobby)

### 1. Clonar e Instalar Dependencias
```bash
git clone https://github.com/tu-usuario/gentia.cl.git
cd gentia.cl
npm install
```

### 2. Configurar Variables de Entorno
Crea un archivo `.env` en la raíz del proyecto basándote en el archivo de plantilla:
```env
RESEND_API_KEY=tu_api_key_de_resend
RECAPTCHA_SECRET=tu_recaptcha_secret
API_REDIRECT_BASE_URL=http://localhost:3000
```

### 3. Levantar Servidores Locales
*   **Backend (API en puerto 3000)**:
    ```bash
    npm run dev
    ```
*   **Frontend (Páginas estáticas)**: Puedes levantarlo con cualquier servidor local estático apuntando a la carpeta `/public` (como la extensión Live Server de VS Code o corriendo `npx servor public 8080 --browse`).

---

## ☁️ Despliegue en Producción

### Despliegue del Servidor y Landing en Vercel
El proyecto está configurado para enrutarse por completo mediante Vercel:
1.  Instala Vercel CLI: `npm install -g vercel`.
2.  Inicia sesión: `vercel login`.
3.  Despliega en producción:
    ```bash
    vercel --prod
    ```
4.  Configura las siguientes variables de entorno en el panel de control de Vercel:
    *   `RESEND_API_KEY`: API Key de Resend.
    *   `RECAPTCHA_SECRET`: Secret Key de reCAPTCHA.
    *   `API_REDIRECT_BASE_URL`: Dirección web de producción (`https://gentia.cl`).
    *   `FIREBASE_SERVICE_ACCOUNT`: Pegar el JSON completo de tu clave privada de Firebase (generada en *Configuración de Proyecto -> Cuentas de Servicio* en la consola de Firebase).

---

## 📄 Licencia
Este proyecto es privado y confidencial. Prohibida su distribución sin autorización de los propietarios.
