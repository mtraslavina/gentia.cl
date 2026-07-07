import express from "express";
import cors from "cors";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

// Initialize Firebase Admin
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } catch (err) {
      console.error("Error parsing FIREBASE_SERVICE_ACCOUNT env var:", err);
      admin.initializeApp();
    }
  } else {
    admin.initializeApp();
  }
}

const db = getFirestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration
const ENV = {
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  RECAPTCHA_SECRET: process.env.RECAPTCHA_SECRET || "",
  API_REDIRECT_BASE_URL: process.env.API_REDIRECT_BASE_URL || "https://gentia.cl",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || ""
};

const getTransporter = (apiKey?: string) => nodemailer.createTransport({ 
  host: "smtp.resend.com", 
  port: 465, 
  secure: true, 
  auth: { user: "resend", pass: apiKey || ENV.RESEND_API_KEY } 
});

const formatearFechaLatina = (f: any) => { 
  if (!f) return ""; 
  const p = f.split("-"); 
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : f; 
};

async function verificarRecaptcha(token: string) { 
  if (!token) return false; 
  const secret = ENV.RECAPTCHA_SECRET; 
  if (!secret || secret.includes("REEMPLAZA")) return true; 
  try { 
    const response = await fetch(`https://www.google.com/recaptcha/api/siteverify?secret=${secret}&response=${token}`, { method: "POST" }); 
    const data: any = await response.json(); 
    return data.success && data.score > 0.4; 
  } catch (e) { 
    return false; 
  } 
}

const generarCuerpoMail = (titulo: string, contenido: string, logoText: string, footerText: string, accionHtml: string = "") => `<!DOCTYPE html><html><head><style>body{font-family:sans-serif;background:#fafaf9;padding:20px;color:#1e293b}.container{max-width:600px;margin:auto;background:white;border-radius:24px;border:1px solid #e7e5e4;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.05)}.header{background:#0f172a;color:white;padding:30px 20px;text-align:center}.header h1{margin:0;font-size:20px;letter-spacing:1px;font-family:ui-serif,Georgia,Cambria,serif}.body{padding:40px 30px;line-height:1.6}.footer{background:#f5f5f4;text-align:center;padding:25px;font-size:11px;color:#78716c;border-top:1px solid #e7e5e4}.btn{display:inline-block;padding:14px 32px;background:#059669;color:white!important;text-decoration:none;border-radius:12px;text-align:center;font-weight:bold;font-size:13px;letter-spacing:1px;text-transform:uppercase;box-shadow:0 4px 6px -1px rgba(5,150,105,0.2)}.btn-pay{background:#0284c7;box-shadow:0 4px 6px -1px rgba(2,132,199,0.2)}.btn-cancel{background:transparent;color:#dc2626!important;border:2px solid #fca5a5;box-shadow:none;margin-top:10px}.highlight-box{background:#f0fdf4;border-left:4px solid #059669;padding:20px;margin:20px 0;border-radius:12px;font-size:14px;color:#166534}</style></head><body><div class="container"><div class="header"><h1>${logoText.toUpperCase()}</h1></div><div class="body"><h2 style="color:#0f172a;margin-top:0;font-size:18px;font-family:ui-serif">${titulo}</h2>${contenido}<div style="text-align:center;margin-top:30px">${accionHtml}</div></div><div class="footer">${footerText}</div></div></body></html>`;

const templateRespuesta = (titulo: string, mensaje: string, color: string, redirectUrl: string) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Respuesta Cita</title><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet"></head><body class="bg-stone-50 flex items-center justify-center min-h-screen p-4" style="font-family: 'Outfit', sans-serif;"><div class="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-xl text-center border border-stone-100"><div class="w-20 h-20 mx-auto rounded-full mb-6 flex items-center justify-center text-white text-3xl font-bold" style="background-color: ${color}; box-shadow: 0 10px 25px -5px ${color}80;">✓</div><h1 class="text-2xl font-bold text-slate-900 mb-4">${titulo}</h1><p class="text-slate-600 mb-8 leading-relaxed">${mensaje}</p><a href="${redirectUrl}" class="inline-block px-8 py-4 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-colors shadow-lg">Entendido</a></div></body></html>`;

const handleExpressCall = (fn: (data: any, req: express.Request) => Promise<any>) => {
  return async (req: express.Request, res: express.Response) => {
    try {
      const data = req.body;
      const result = await fn(data, req);
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
    }
  };
};

// Endpoints

app.post("/api/reservarHora", handleExpressCall(async (data) => {
  const { psicologoId, nombre, email, telefono, codigoPais, fecha, hora, modalidad, precio, recaptchaToken, plan } = data;
  if (!psicologoId || !nombre || !telefono) throw new Error("Datos incompletos.");
  
  if (recaptchaToken) await verificarRecaptcha(recaptchaToken);
  const phoneId = telefono.replace(/\D/g, ''); 
  
  // Get Psychologist profile
  const psDoc = await db.collection("psicologos").doc(psicologoId).get();
  if (!psDoc.exists) throw new Error("Psicólogo no registrado.");
  const psData = psDoc.data()!;
  const psNombre = psData.nombre || "Profesional";
  const psEmail = psData.email;

  const citasRef = db.collection("psicologos").doc(psicologoId).collection("citas"); 
  const pacienteRef = db.collection("psicologos").doc(psicologoId).collection("pacientes").doc(phoneId);
  
  const pacSnap = await pacienteRef.get(); 
  const esAntiguo = pacSnap.exists; 
  const oldName = esAntiguo ? pacSnap.data()?.nombre : "";
  const mod = modalidad || "Online"; 
  const prec = Number(precio) || (mod === "Presencial" ? (psData.precioPresencial || 35000) : (psData.precioOnline || 25000));

  const idCitaCreada = await db.runTransaction(async (t) => {
    const q = citasRef.where("fecha", "==", fecha).where("hora", "==", hora);
    const s = await t.get(q);
    if (s.docs.find(d => d.data().estado !== "cancelado")) throw new Error("Horario ocupado.");
    const newCita = citasRef.doc();
    t.set(newCita, { 
      psicologoId,
      pacienteId: phoneId, 
      nombre, 
      email, 
      telefono, 
      codigoPais: codigoPais || '+56', 
      fecha, 
      hora, 
      modalidad: mod, 
      precio: prec,
      plan: plan || null,
      estado: "confirmada", 
      createdAt: admin.firestore.FieldValue.serverTimestamp() 
    });
    t.set(pacienteRef, { 
      nombre, 
      email, 
      telefono, 
      codigoPais: codigoPais || '+56', 
      genero: pacSnap.data()?.genero || "Omitido", 
      updatedAt: admin.firestore.FieldValue.serverTimestamp() 
    }, { merge: true });
    return newCita.id;
  });

  const baseRedirectUrl = ENV.API_REDIRECT_BASE_URL;
  const linkAnular = `${baseRedirectUrl}/api/procesarRespuestaPaciente?psicologoId=${psicologoId}&id=${idCitaCreada}&accion=anular`;
  const linkPago = `${baseRedirectUrl}/agendar.html?id=${psicologoId}&pago_cita_id=${idCitaCreada}`; 
  
  const planInfoHtml = plan 
    ? `<p>Plan/Pack Seleccionado: <strong>${plan}</strong></p><p>Esta cita corresponde a la <strong>1ª sesión</strong> del plan.</p>`
    : `<p>Modalidad: <strong>${mod}</strong></p>`;
    
  const html = `<p>Hola <strong>${nombre}</strong>,</p><p>Tu reserva con <strong>${psNombre}</strong> para el ${formatearFechaLatina(fecha)} a las ${hora} hrs está confirmada.</p>${planInfoHtml}`;
  const botones = `<a href="${linkPago}" class="btn btn-pay">PAGAR PLAN / SESIÓN</a><br><a href="${linkAnular}" class="btn btn-cancel">ANULAR CITA</a>`;
  
  // Send email to patient
  const transporter = getTransporter(psData.resendApiKey);
  await transporter.sendMail({ 
    from: `"${psNombre} en Gentia" <contacto@gentia.cl>`, 
    to: email, 
    subject: `Confirmación de Cita - ${psNombre}`, 
    html: generarCuerpoMail("Reserva Exitosa", html, psNombre, `© 2026 gentia.cl - Gestionado para ${psNombre}`, botones) 
  });
  
  const detallesPaciente = `
  <div style="background:#f5f5f4; padding:20px; border-radius:12px; margin-top:15px; font-family:sans-serif; color:#444;">
    <strong style="color:#0f172a; font-size:15px;">Detalles de la Reserva:</strong><br><br>
    <strong>Nombre:</strong> ${nombre}<br>
    <strong>Email:</strong> ${email}<br>
    <strong>Teléfono:</strong> ${codigoPais || '+56'} ${telefono}<br>
    <strong>Fecha:</strong> ${formatearFechaLatina(fecha)}<br>
    <strong>Hora:</strong> ${hora} hrs<br>
    <strong>Modalidad:</strong> ${mod}<br>
    ${plan ? `<strong>Plan/Pack:</strong> ${plan}<br>` : ''}
    <strong>Monto Cita:</strong> $${prec.toLocaleString('es-CL')}
  </div>
  `;

  // Send email alert to psychologist
  if (psEmail) {
    if (esAntiguo) {
      let msgText = `El paciente <b>${nombre}</b> volvió a agendar.`;
      if (oldName && oldName.trim().toLowerCase() !== nombre.trim().toLowerCase()) { 
        msgText = `El paciente volvió a agendar.<br><br><span style="color:#ef4444; font-weight:bold;">⚠️ ATENCIÓN: El paciente registró un cambio de nombre.</span><br>Nombre anterior: <b>${oldName}</b><br>Nuevo nombre: <b>${nombre}</b>`; 
      }
      await transporter.sendMail({ 
        from: `"Gentia Alertas" <contacto@gentia.cl>`, 
        to: psEmail, 
        subject: `REINCIDENCIA: ${nombre}`, 
        html: generarCuerpoMail("Alerta de Reincidencia", `<p>${msgText}</p>${detallesPaciente}`, "Gentia", "© 2026 gentia.cl") 
      });
    } else {
      await transporter.sendMail({ 
        from: `"Gentia Alertas" <contacto@gentia.cl>`, 
        to: psEmail, 
        subject: `NUEVO PACIENTE: ${nombre}`, 
        html: generarCuerpoMail("Ingreso Nuevo", `<p>Se ha registrado un nuevo paciente para atención clínica.</p>${detallesPaciente}`, "Gentia", "© 2026 gentia.cl") 
      });
    }
  }
  return { success: true, idCita: idCitaCreada };
}));

app.post("/api/obtenerDisponibilidadMes", handleExpressCall(async (data) => {
  const { psicologoId, year, month } = data;
  if (!psicologoId || !year || !month) throw new Error("Datos incompletos.");
  
  const monthStr = month.toString().padStart(2, "0");
  const startDate = `${year}-${monthStr}-01`;
  
  const citasSnap = await db.collection("psicologos").doc(psicologoId)
    .collection("citas")
    .where("fecha", ">=", startDate)
    .get();
    
  return citasSnap.docs
    .filter(d => d.data().estado !== "cancelado")
    .map(d => ({
      fecha: d.data().fecha,
      hora: d.data().hora
    }));
}));

app.post("/api/enviarEmailManual", handleExpressCall(async (data) => {
  const { psicologoId, idCita, tipo, monto } = data; 
  if (!psicologoId || !idCita || !tipo) throw new Error("Datos incompletos.");

  const psDoc = await db.collection("psicologos").doc(psicologoId).get();
  if (!psDoc.exists) throw new Error("Psicólogo no registrado.");
  const psData = psDoc.data()!;
  const psNombre = psData.nombre || "Profesional";

  const doc = await db.collection("psicologos").doc(psicologoId).collection("citas").doc(idCita).get(); 
  if (!doc.exists) throw new Error("Cita no encontrada"); 
  const d = doc.data()!; 

  if (monto && d.precio !== Number(monto)) { 
    await db.collection("psicologos").doc(psicologoId).collection("citas").doc(idCita).update({ precio: Number(monto) }); 
    d.precio = Number(monto); 
  }

  const fecha = formatearFechaLatina(d.fecha); 
  const transporter = getTransporter(psData.resendApiKey); 
  const pacDoc = await db.collection("psicologos").doc(psicologoId).collection("pacientes").doc(d.pacienteId).get(); 
  const nombreActual = pacDoc.exists ? pacDoc.data()!.nombre : d.nombre; 
  
  const baseRedirectUrl = ENV.API_REDIRECT_BASE_URL;
  const linkConf = `${baseRedirectUrl}/api/procesarRespuestaPaciente?psicologoId=${psicologoId}&id=${idCita}&accion=confirmar`; 
  const linkAnular = `${baseRedirectUrl}/api/procesarRespuestaPaciente?psicologoId=${psicologoId}&id=${idCita}&accion=anular`;
  const linkPago = `${baseRedirectUrl}/agendar.html?id=${psicologoId}&pago_cita_id=${idCita}`;

  const footerMail = `© 2026 gentia.cl - Gestionado para ${psNombre}`;

  if (tipo === 'pago') { 
    const montoFormateado = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(d.precio || 25000);
    
    let datosTransferenciaHtml = "";
    if (psData.datosTransferencia && typeof psData.datosTransferencia === 'object') {
      const tf = psData.datosTransferencia as any;
      if (tf.banco) {
        datosTransferenciaHtml = `
          <strong>Datos para Transferencia:</strong><br>
          <b>Nombre Titular:</b> ${tf.nombre || psNombre}<br>
          <b>RUT:</b> ${tf.rut || ""}<br>
          <b>Banco:</b> ${tf.banco || ""}<br>
          <b>Tipo Cuenta:</b> ${tf.tipoCuenta || ""}<br>
          <b>N° Cuenta:</b> ${tf.numCuenta || ""}<br>
          <b>Email de Aviso:</b> ${tf.email || psData.email || ""}
        `;
      } else {
        datosTransferenciaHtml = "Datos de transferencia no configurados por el profesional.";
      }
    } else {
      datosTransferenciaHtml = `<strong>Datos Transferencia:</strong><br>${psData.datosTransferencia || "Datos no configurados por el profesional en la plataforma."}`;
    }

    const html = `<p>Hola <strong>${nombreActual}</strong>,</p><p>Te enviamos este recordatorio para el pago de tu sesión del <strong>${fecha}</strong> (${d.modalidad||'Online'}).</p><div style="background:#f5f5f4; padding:15px; border-radius:12px; text-align:center; margin:20px 0;"><span style="font-size:12px; color:#78716c; text-transform:uppercase; letter-spacing:1px;">Monto a pagar</span><br><span style="font-size:24px; font-weight:bold; color:#0f172a;">${montoFormateado}</span></div><p style="text-align:center;font-size:12px;color:#78716c;">Puedes pagar rápidamente con cualquier tarjeta a través de Webpay, o vía transferencia bancaria:</p><div style="background:#f0fdf4; border: 1px solid #bbf7d0; border-radius:12px; padding:15px; margin-top:10px; font-size:13px; color:#166534; line-height:1.5;">${datosTransferenciaHtml}</div>`; 
    const btn = `<a href="${linkPago}" class="btn btn-pay">PAGAR ONLINE</a>`; 
    await transporter.sendMail({ 
      from: `"Finanzas ${psNombre}" <contacto@gentia.cl>`, 
      to: d.email, 
      subject: `Pago Pendiente - ${psNombre}`, 
      html: generarCuerpoMail("Gestión de Pago", html, psNombre, footerMail, btn) 
    }); 
  } else if (tipo === 'sesion') { 
    const html = `<p>Hola <strong>${nombreActual}</strong>,</p><p>Recordatorio de sesión para el <strong>${fecha} a las ${d.hora} hrs</strong> (${d.modalidad||'Online'}).</p>`; 
    const btn = `<a href="${linkConf}" class="btn">CONFIRMAR ASISTENCIA</a><br><a href="${linkAnular}" class="btn btn-cancel">ANULAR SESIÓN</a>`; 
    await transporter.sendMail({ 
      from: `"${psNombre}" <contacto@gentia.cl>`, 
      to: d.email, 
      subject: `Recordatorio de Sesión - ${psNombre}`, 
      html: generarCuerpoMail("Recordatorio", html, psNombre, footerMail, btn) 
    }); 
  } else if (tipo === 'cambio') { 
    const htmlPac = `<p>Hola <strong>${nombreActual}</strong>,</p><p>Tu sesión ha sido <strong>reagendada</strong>. El nuevo horario es el <strong>${fecha} a las ${d.hora} hrs</strong> (${d.modalidad||'Online'}).</p>`; 
    const btnPac = `<a href="${linkConf}" class="btn">CONFIRMAR ASISTENCIA</a><br><a href="${linkAnular}" class="btn btn-cancel">ANULAR SESIÓN</a>`; 
    await transporter.sendMail({ 
      from: `"${psNombre}" <contacto@gentia.cl>`, 
      to: d.email, 
      subject: `Actualización de Horario - ${psNombre}`, 
      html: generarCuerpoMail("Sesión Reagendada", htmlPac, psNombre, footerMail, btnPac) 
    }); 
    if (psData.email) {
      await transporter.sendMail({ 
        from: `"Gentia Alertas" <contacto@gentia.cl>`, 
        to: psData.email, 
        subject: `HORA MODIFICADA: ${nombreActual}`, 
        html: generarCuerpoMail("Cambio de Horario", `<p>La sesión de <b>${nombreActual}</b> fue reprogramada para el <b>${fecha} a las ${d.hora} hrs</b>.</p>`, "Gentia", "© 2026 gentia.cl") 
      });
    }
  } 
  return { success: true };
}));

app.get("/api/procesarRespuestaPaciente", async (req, res) => {
  const { psicologoId, id, accion } = req.query; 
  if(!psicologoId || !id) {
    res.status(400).send("ID o Psicólogo Faltante");
    return;
  }

  const psDoc = await db.collection("psicologos").doc(psicologoId as string).get();
  if (!psDoc.exists) {
    res.status(404).send("Psicólogo no encontrado");
    return;
  }
  const psData = psDoc.data()!;
  const psNombre = psData.nombre || "Profesional";

  const ref = db.collection("psicologos").doc(psicologoId as string).collection("citas").doc(id as string); 
  const snap = await ref.get(); 
  if(!snap.exists) { 
    res.send(templateRespuesta("Enlace Caducado", "Esta cita ya no se encuentra en nuestros registros.", "#78716c", ENV.API_REDIRECT_BASE_URL)); 
    return; 
  } 
  const cita = snap.data()!; 
  const transporter = getTransporter(psData.resendApiKey); 
  
  if(accion === "confirmar") { 
    await ref.update({ estado: "reconfirmada" }); 
    if (psData.email) {
      await transporter.sendMail({ 
        from: `"Gentia Alertas" <contacto@gentia.cl>`, 
        to: psData.email, 
        subject: `✅ CONFIRMA ASISTENCIA: ${cita.nombre}`, 
        html: generarCuerpoMail("Confirmación", `<p>El paciente <b>${cita.nombre}</b> ha confirmado su asistencia para el ${formatearFechaLatina(cita.fecha)} a las ${cita.hora}.</p>`, "Gentia", "© 2026 gentia.cl") 
      }); 
    }
    res.send(templateRespuesta("¡Asistencia Confirmada!", `Tu sesión con ${psNombre} para el ${formatearFechaLatina(cita.fecha)} ha sido reconfirmada exitosamente. ¡Nos vemos!`, "#059669", `${ENV.API_REDIRECT_BASE_URL}/agendar.html?id=${psicologoId}`)); 
  } else { 
    await ref.update({ estado: "cancelado" }); 
    if (psData.email) {
      await transporter.sendMail({ 
        from: `"Gentia Alertas" <contacto@gentia.cl>`, 
        to: psData.email, 
        subject: `❌ ANULACIÓN: ${cita.nombre}`, 
        html: generarCuerpoMail("Cita Anulada", `<p>El paciente <b>${cita.nombre}</b> ha <b>ANULADO</b> su cita del ${formatearFechaLatina(cita.fecha)} a las ${cita.hora}. El horario ha sido liberado.</p>`, "Gentia", "© 2026 gentia.cl") 
      }); 
    }
    res.send(templateRespuesta("Cita Anulada", "Tu reserva ha sido cancelada. Esperamos verte en otra oportunidad.", "#dc2626", `${ENV.API_REDIRECT_BASE_URL}/agendar.html?id=${psicologoId}`)); 
  }
});

// Google Calendar Sync Functions

app.post("/api/getGoogleAuthUrl", handleExpressCall(async (data) => {
  const { redirectUri } = data;
  if (!redirectUri) throw new Error("Falta la URL de redireccionamiento.");
  
  const scope = "https://www.googleapis.com/auth/calendar.events";
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent&response_type=code&client_id=${encodeURIComponent(ENV.GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
  
  return { url: authUrl };
}));

app.post("/api/saveGoogleTokens", handleExpressCall(async (data) => {
  const { psicologoId, code, redirectUri, clientId, clientSecret } = data; 
  if (!psicologoId || !code) throw new Error("Faltan parámetros de seguridad."); 

  const finalClientId = clientId || ENV.GOOGLE_CLIENT_ID;
  const finalClientSecret = clientSecret || ENV.GOOGLE_CLIENT_SECRET;

  const params = new URLSearchParams(); 
  params.append('code', code); 
  params.append('client_id', finalClientId); 
  params.append('client_secret', finalClientSecret); 
  params.append('redirect_uri', redirectUri); 
  params.append('grant_type', 'authorization_code'); 

  const response = await fetch('https://oauth2.googleapis.com/token', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
    body: params 
  }); 

  const tokenData = await response.json() as any; 
  if (!response.ok) throw new Error(`Google rechazó el código: ${tokenData.error_description || tokenData.error || JSON.stringify(tokenData)}`); 

  const tokens = { 
    access_token: tokenData.access_token, 
    refresh_token: tokenData.refresh_token, 
    scope: tokenData.scope, 
    token_type: tokenData.token_type, 
    expiry_date: Date.now() + ((tokenData.expires_in || 3600) * 1000) 
  }; 

  const updatePayload: any = { googleTokens: tokens };
  if (clientId && clientSecret) {
    updatePayload.googleConfig = { clientId, clientSecret };
  }

  await db.collection("psicologos").doc(psicologoId).set(updatePayload, { merge: true }); 
  return { success: true };
}));

app.post("/api/syncCalendarEvent", handleExpressCall(async (data) => {
  const { psicologoId, idCita } = data; 
  if (!psicologoId || !idCita) throw new Error("Datos incompletos.");

  const psDoc = await db.collection("psicologos").doc(psicologoId).get(); 
  if (!psDoc.exists) throw new Error("Psicólogo no encontrado."); 
  const psData = psDoc.data() || {}; 

  if (!psData.googleTokens || !psData.googleTokens.access_token) { 
    throw new Error("No hay tokens de Google Calendar vinculados."); 
  } 

  // Verify token expiry and refresh if needed
  let accessToken = psData.googleTokens.access_token;
  if (psData.googleTokens.expiry_date && Date.now() >= psData.googleTokens.expiry_date - 60000) {
    // Refresh Token
    const refreshToken = psData.googleTokens.refresh_token;
    const finalClientId = psData.googleConfig?.clientId || ENV.GOOGLE_CLIENT_ID;
    const finalClientSecret = psData.googleConfig?.clientSecret || ENV.GOOGLE_CLIENT_SECRET;
    
    if (refreshToken && finalClientId && finalClientSecret) {
      try {
        const params = new URLSearchParams();
        params.append('client_id', finalClientId);
        params.append('client_secret', finalClientSecret);
        params.append('refresh_token', refreshToken);
        params.append('grant_type', 'refresh_token');

        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params
        });
        const tokenData = await response.json() as any;
        if (response.ok) {
          accessToken = tokenData.access_token;
          const newTokens = {
            ...psData.googleTokens,
            access_token: accessToken,
            expiry_date: Date.now() + ((tokenData.expires_in || 3600) * 1000)
          };
          await db.collection("psicologos").doc(psicologoId).update({ googleTokens: newTokens });
        }
      } catch (err) {
        console.error("Error refreshing Google token:", err);
      }
    }
  }

  const citaSnap = await db.collection("psicologos").doc(psicologoId).collection("citas").doc(idCita).get(); 
  if (!citaSnap.exists) throw new Error("Cita no encontrada."); 
  const cita = citaSnap.data() || {}; 

  const startDateTime = `${cita.fecha}T${cita.hora}:00-03:00`; 
  const endHour = parseInt(cita.hora.split(':')[0]) + 1; 
  const endDateTime = `${cita.fecha}T${endHour.toString().padStart(2, '0')}:00:00-03:00`; 

  const eventPayload = { 
    summary: `Sesión Psicoterapia: ${cita.nombre || 'Paciente'}`, 
    description: `Agendada desde Gentia. Modalidad: ${cita.modalidad}`, 
    start: { dateTime: startDateTime, timeZone: 'America/Santiago' }, 
    end: { dateTime: endDateTime, timeZone: 'America/Santiago' }, 
    conferenceData: cita.modalidad === 'Online' ? { createRequest: { requestId: idCita, conferenceSolutionKey: { type: "hangoutsMeet" } } } : undefined 
  }; 

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', { 
    method: 'POST', 
    headers: { 
      'Authorization': `Bearer ${accessToken}`, 
      'Content-Type': 'application/json' 
    }, 
    body: JSON.stringify(eventPayload) 
  }); 

  const resData = await response.json() as any; 

  if (!response.ok) { 
    if (resData.error && resData.error.code === 401) { 
      throw new Error("Sesión de Google Calendar expiró. Vuelve a vincular tu cuenta."); 
    } 
    throw new Error(`API Google Calendar: ${resData.error?.message}`); 
  } 

  let meetLink = null; 
  if(resData.conferenceData && resData.conferenceData.entryPoints) { 
    const ep = resData.conferenceData.entryPoints.find((e:any) => e.entryPointType === 'video'); 
    if(ep) meetLink = ep.uri; 
  } 

  await db.collection("psicologos").doc(psicologoId).collection("citas").doc(idCita).update({ 
    meetLink: meetLink, 
    googleEventId: resData.id 
  }); 
  
  return { success: true, meetUrl: meetLink };
}));

// Fallback path
app.get("*", (req, res) => {
  res.status(404).send("API Endpoint Not Found");
});

export default app;
