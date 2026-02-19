/// <reference lib="webworker" />

// 🔥 PRIMEIRO: carregar OneSignal
self.importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// 🔥 DEPOIS: Workbox
import { precacheAndRoute } from "workbox-precaching";

precacheAndRoute(self.__WB_MANIFEST);
