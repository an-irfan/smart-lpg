const express = require("express");
const os = require("os");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const MAX_HISTORY_POINTS = 30;
const HEARTBEAT_INTERVAL_MS = 15000;
const DEFAULT_WIFI_IP = process.env.WIFI_IP || "10.62.116.8";
const sseClients = new Set();
let sequence = 1;

function isIpv4Address(value) {
    return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(value || ""));
}

function getPreferredWifiIp() {
    const networkInterfaces = os.networkInterfaces();
    const interfaceNames = Object.keys(networkInterfaces);
    const preferredInterfaceName = interfaceNames.find((name) => /wi-?fi|wireless/i.test(name));
    const prioritizedNames = preferredInterfaceName ? [preferredInterfaceName, ...interfaceNames] : interfaceNames;

    for (const interfaceName of prioritizedNames) {
        const addresses = networkInterfaces[interfaceName] || [];

        for (const address of addresses) {
            if (
                address &&
                address.family === "IPv4" &&
                !address.internal &&
                isIpv4Address(address.address)
            ) {
                return address.address;
            }
        }
    }

    return DEFAULT_WIFI_IP;
}

function resolveWifiIp(value) {
    if (isIpv4Address(value)) {
        return value;
    }

    return getPreferredWifiIp();
}

let sensorData = {
    id: sequence,
    mq2: 0,
    mq135: 150,
    gasStatus: "SAFE",
    led: "OFF",
    buzzer: "OFF",
    wifi: getPreferredWifiIp(),
    lcdLine1: "Smart LPG Ready",
    lcdLine2: `MQ135 150 | ${getPreferredWifiIp()}`,
    updatedAt: new Date().toISOString()
};

let sensorHistory = [sensorData];

function toFiniteNumber(value, fallback) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function normalizeStatus(status, fallback) {
    if (typeof status !== "string") {
        return fallback;
    }

    const cleanedStatus = status.trim();
    return cleanedStatus || fallback;
}

function normalizeDeviceState(value, fallback) {
    if (typeof value === "boolean") {
        return value ? "ON" : "OFF";
    }

    if (typeof value === "number") {
        return value > 0 ? "ON" : "OFF";
    }

    if (typeof value === "string") {
        const normalizedValue = value.trim().toUpperCase();

        if (["ON", "HIGH", "ACTIVE", "TRUE", "1"].includes(normalizedValue)) {
            return "ON";
        }

        if (["OFF", "LOW", "INACTIVE", "FALSE", "0"].includes(normalizedValue)) {
            return "OFF";
        }
    }

    return fallback;
}

function normalizeLcdLine(value, fallback) {
    if (typeof value !== "string") {
        return fallback;
    }

    const cleanedValue = value.replace(/\s+/g, " ").trim();
    return cleanedValue || fallback;
}

function getDefaultLcdLine1(status) {
    const normalizedStatus = String(status || "SAFE").toUpperCase();

    if (normalizedStatus.includes("DANGER") || normalizedStatus.includes("LEAK")) {
        return "Gas Leak Alert";
    }

    if (normalizedStatus.includes("WARN") || normalizedStatus.includes("ALERT")) {
        return "Check Gas Level";
    }

    return "Smart LPG Ready";
}

function getDefaultLcdLine2(mq135, wifi) {
    return `MQ135 ${mq135} | ${wifi}`;
}

function createSensorSnapshot(payload = {}) {
    const mq2 = Math.max(0, toFiniteNumber(payload.mq2, sensorData.mq2));
    const mq135 = Math.max(0, toFiniteNumber(payload.mq135, sensorData.mq135));
    const gasStatus = normalizeStatus(payload.gasStatus, sensorData.gasStatus);
    const led = normalizeDeviceState(payload.led, sensorData.led);
    const buzzer = normalizeDeviceState(payload.buzzer, sensorData.buzzer);
    const wifi = resolveWifiIp(payload.wifi);

    return {
        id: ++sequence,
        mq2,
        mq135,
        gasStatus,
        led,
        buzzer,
        wifi,
        lcdLine1: normalizeLcdLine(payload.lcdLine1, getDefaultLcdLine1(gasStatus)),
        lcdLine2: normalizeLcdLine(payload.lcdLine2, getDefaultLcdLine2(mq135, wifi)),
        updatedAt: new Date().toISOString()
    };
}

function pushHistory(snapshot) {
    sensorHistory.push(snapshot);

    if (sensorHistory.length > MAX_HISTORY_POINTS) {
        sensorHistory = sensorHistory.slice(-MAX_HISTORY_POINTS);
    }
}

function sendSseEvent(client, eventName, payload) {
    client.write(`event: ${eventName}\n`);
    client.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastSensorUpdate(snapshot) {
    for (const client of sseClients) {
        sendSseEvent(client, "sensor", snapshot);
    }
}

setInterval(() => {
    for (const client of sseClients) {
        client.write(": keep-alive\n\n");
    }
}, HEARTBEAT_INTERVAL_MS);

// Dashboard
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Get latest data
app.get("/api/latest", (req, res) => {
    res.json(sensorData);
});

app.get("/api/history", (req, res) => {
    res.json(sensorHistory);
});

app.get("/api/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    sseClients.add(res);

    sendSseEvent(res, "sensor", sensorData);

    req.on("close", () => {
        sseClients.delete(res);
    });
});

// Receive data from ESP8266
app.post("/api/sensor", (req, res) => {
    if (!req.body || typeof req.body !== "object") {
        return res.status(400).json({
            success: false,
            message: "Invalid sensor payload"
        });
    }

    sensorData = createSensorSnapshot(req.body);
    pushHistory(sensorData);
    broadcastSensorUpdate(sensorData);

    console.log(sensorData);

    res.json({
        success: true,
        message: "Data received successfully",
        data: sensorData
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📶 Wi-Fi LAN URL: http://${getPreferredWifiIp()}:${PORT}`);
});
