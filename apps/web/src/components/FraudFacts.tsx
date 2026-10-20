"use client";
import { useEffect, useState } from "react";

/** Collects the browser facts HMRC's fraud-prevention headers need, as a hidden form field. */
export function FraudFacts() {
  const [facts, setFacts] = useState("");
  useEffect(() => {
    let deviceId = "";
    try {
      deviceId = localStorage.getItem("hmrc-device-id") ?? crypto.randomUUID();
      localStorage.setItem("hmrc-device-id", deviceId);
    } catch { deviceId = crypto.randomUUID(); }
    setFacts(JSON.stringify({
      deviceId, userAgent: navigator.userAgent,
      screens: { width: screen.width, height: screen.height, scalingFactor: window.devicePixelRatio, colourDepth: screen.colorDepth },
      windowSize: { width: window.innerWidth, height: window.innerHeight },
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    }));
  }, []);
  return <input type="hidden" name="fraudFacts" value={facts} />;
}
