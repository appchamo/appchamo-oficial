/// <reference lib="webworker" />

import { precacheAndRoute } from "workbox-precaching";

// Isso é injetado automaticamente pelo Vite
precacheAndRoute(self.__WB_MANIFEST);

// 🔥 Integração do OneSignal dentro do mesmo Service Worker
self.importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
