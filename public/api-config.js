// Configuration for Firebase and Vercel Redirector

export const firebaseConfig = {
  projectId: "gentia-21b97",
  appId: "1:788725251180:web:0032978678c8f1e9f42c49",
  storageBucket: "gentia-21b97.firebasestorage.app",
  apiKey: "AIzaSyAa3_Yaq6OCagOWUhuldqvG0QXYgVYhPMs",
  authDomain: "gentia-21b97.firebaseapp.com",
  messagingSenderId: "788725251180",
  measurementId: "G-G9YDNDCS5E",
  projectNumber: "788725251180"
};

// Drop-in wrapper to redirect Firebase Functions calls to Vercel Serverless Function endpoints
export function getFunctions(app, region) {
  // Determine backend URL (local or production Vercel deployment)
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const baseUrl = isLocal ? "http://localhost:3000/api" : "/api";
  
  return {
    app,
    region,
    baseUrl
  };
}

export function httpsCallable(functionsInstance, name, options) {
  return async (data) => {
    const url = `${functionsInstance.baseUrl}/${name}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const errText = await response.text();
      let errMsg = "Error en el servidor API";
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error || errMsg;
      } catch (e) {}
      throw new Error(errMsg);
    }
    
    const result = await response.json();
    // Return in the format expected by the Firebase client SDK wrapper: { data: result }
    return { data: result };
  };
}
