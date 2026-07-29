const MAX_POINTS = 30;
const ctx = document.getElementById("airChart");
const mq2Element = document.getElementById("mq2");
const mq135Element = document.getElementById("mq135");
const statusElement = document.getElementById("status");
const statusDetailElement = document.getElementById("statusDetail");
const wifiElement = document.getElementById("wifi");
const ledElement = document.getElementById("led");
const ledLightElement = document.getElementById("ledLight");
const ledDetailElement = document.getElementById("ledDetail");
const buzzerElement = document.getElementById("buzzer");
const buzzerLightElement = document.getElementById("buzzerLight");
const buzzerDetailElement = document.getElementById("buzzerDetail");
const connectionStateElement = document.getElementById("connectionState");
const streamModeElement = document.getElementById("streamMode");
const lastUpdatedElement = document.getElementById("lastUpdated");
const lcdLine1Element = document.getElementById("lcdLine1");
const lcdLine2Element = document.getElementById("lcdLine2");

let lastPointId = 0;
let eventSource;
let fallbackPollingId;

function formatChartTime(timestamp) {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        return "--:--:--";
    }

    return date.toLocaleTimeString();
}

function formatDisplayTime(timestamp) {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        return "Unknown";
    }

    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function formatLcdLine(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback;
}

function getStatusTone(status) {
    const normalizedStatus = String(status || "").toUpperCase();

    if (normalizedStatus.includes("DANGER") || normalizedStatus.includes("LEAK")) {
        return "danger";
    }

    if (normalizedStatus.includes("WARN") || normalizedStatus.includes("ALERT")) {
        return "warning";
    }

    return "safe";
}

function getActuatorTone(state) {
    return String(state || "").toUpperCase() === "ON" ? "danger" : "safe";
}

function getLedTone(state) {
    return String(state || "").toUpperCase() === "ON" ? "safe" : "";
}

function updateConnectionState(label, tone) {
    connectionStateElement.textContent = label;
    connectionStateElement.className = `pill ${tone}`;
}

function trimChart() {
    while (chart.data.labels.length > MAX_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
}

function appendPoint(snapshot) {
    if (!snapshot || snapshot.id <= lastPointId) {
        return;
    }

    chart.data.labels.push(formatChartTime(snapshot.updatedAt));
    chart.data.datasets[0].data.push(snapshot.mq135);
    trimChart();
    lastPointId = snapshot.id;
}

function renderSnapshot(snapshot, shouldAppend = true) {
    if (!snapshot) {
        return;
    }

    mq2Element.textContent = snapshot.mq2;
    mq135Element.textContent = snapshot.mq135;
    statusElement.textContent = snapshot.gasStatus;
    wifiElement.textContent = snapshot.wifi;
    ledElement.textContent = snapshot.led || "OFF";
    buzzerElement.textContent = snapshot.buzzer || "OFF";
    lcdLine1Element.textContent = formatLcdLine(snapshot.lcdLine1, "Smart LPG Ready");
    lcdLine2Element.textContent = formatLcdLine(snapshot.lcdLine2, `MQ135 ${snapshot.mq135} | ${snapshot.wifi}`);
    lastUpdatedElement.textContent = formatDisplayTime(snapshot.updatedAt);

    const tone = getStatusTone(snapshot.gasStatus);
    const ledTone = getLedTone(snapshot.led);
    const buzzerTone = getActuatorTone(snapshot.buzzer);

    statusElement.className = tone;
    ledElement.className = ledTone;
    buzzerElement.className = buzzerTone;
    ledLightElement.className = `indicator-light ${snapshot.led === "ON" ? "on" : "off"} ${ledTone}`;
    buzzerLightElement.className = `indicator-light ${snapshot.buzzer === "ON" ? "on" : "off"} ${buzzerTone}`;
    statusDetailElement.textContent =
        tone === "danger" ? "Immediate attention required"
        : tone === "warning" ? "Conditions need checking"
        : "System is stable";
    ledDetailElement.textContent =
        snapshot.led === "ON" ? "Indicator is active" : "Indicator is idle";
    buzzerDetailElement.textContent =
        buzzerTone === "danger" ? "Alarm is sounding" : "Alarm is silent";

    if (shouldAppend) {
        appendPoint(snapshot);
    } else {
        lastPointId = Math.max(lastPointId, snapshot.id || 0);
    }

    chart.update("none");
}

const chart = new Chart(ctx, {
    type: "line",
    data: {
        labels: [],
        datasets: [
            {
                label: "MQ135",
                data: [],
                borderColor: "#fafafa",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                tension: 0.3,
                borderWidth: 3,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHitRadius: 14,
                fill: true
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: "index",
            intersect: false
        },
        plugins: {
            legend: {
                labels: {
                    color: "#fafafa",
                    usePointStyle: true,
                    pointStyle: "circle"
                }
            }
        },
        scales: {
            x: {
                ticks: {
                    color: "#a1a1aa"
                },
                grid: {
                    color: "rgba(255, 255, 255, 0.08)"
                }
            },
            y: {
                min: 0,
                max: 500,
                ticks: {
                    color: "#a1a1aa",
                    stepSize: 100
                },
                grid: {
                    color: "rgba(255, 255, 255, 0.08)"
                }
            }
        }
    }
});

async function loadHistory() {
    const response = await fetch("/api/history");
    const history = await response.json();

    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    lastPointId = 0;

    history.slice(-MAX_POINTS).forEach((snapshot) => {
        appendPoint(snapshot);
    });

    if (history.length > 0) {
        renderSnapshot(history[history.length - 1], false);
    } else {
        chart.update("none");
    }
}

async function loadLatest() {
    const response = await fetch("/api/latest");
    const snapshot = await response.json();
    renderSnapshot(snapshot, snapshot.id > lastPointId);
}

function startFallbackPolling() {
    if (fallbackPollingId) {
        return;
    }

    streamModeElement.textContent = "Fallback polling active";

    fallbackPollingId = window.setInterval(async () => {
        try {
            await loadLatest();
        } catch (error) {
            console.error("Polling failed", error);
        }
    }, 5000);
}

function stopFallbackPolling() {
    if (!fallbackPollingId) {
        return;
    }

    window.clearInterval(fallbackPollingId);
    fallbackPollingId = undefined;
}

function connectRealtimeStream() {
    if (eventSource) {
        eventSource.close();
    }

    eventSource = new EventSource("/api/stream");

    eventSource.addEventListener("open", () => {
        updateConnectionState("Live", "safe");
        streamModeElement.textContent = "Server-sent events active";
        stopFallbackPolling();
    });

    eventSource.addEventListener("sensor", (event) => {
        try {
            const snapshot = JSON.parse(event.data);
            renderSnapshot(snapshot, snapshot.id > lastPointId);
        } catch (error) {
            console.error("Invalid realtime payload", error);
        }
    });

    eventSource.onerror = () => {
        updateConnectionState("Reconnecting...", "warning");
        startFallbackPolling();
    };
}

async function initializeDashboard() {
    try {
        await loadHistory();
        updateConnectionState("Starting...", "warning");
        connectRealtimeStream();
    } catch (error) {
        console.error("Failed to initialize dashboard", error);
        updateConnectionState("Offline", "danger");
        streamModeElement.textContent = "Using fallback polling";
        startFallbackPolling();
        await loadLatest();
    }
}

initializeDashboard();
