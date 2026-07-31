const MAX_POINTS = 30;
const airCtx = document.getElementById("airChart");
const mq2Ctx = document.getElementById("mq2Chart");
const mq2Element = document.getElementById("mq2");
const mq135Element = document.getElementById("mq135");
const statusElement = document.getElementById("status");
const statusDetailElement = document.getElementById("statusDetail");
const statusCardElement = document.getElementById("statusCard");
const wifiElement = document.getElementById("wifi");
const ledElement = document.getElementById("led");
const ledLightElement = document.getElementById("ledLight");
const ledDetailElement = document.getElementById("ledDetail");
const ledCardElement = document.getElementById("ledCard");
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

function getStatusTone(status, mq2) {
    const normalizedStatus = String(status || "").toUpperCase();

    if (normalizedStatus.includes("DANGER") || normalizedStatus.includes("LEAK")) {
        return "danger";
    }

    if (normalizedStatus.includes("ALERT")) {
        return "alert";
    }

    if (normalizedStatus.includes("WARN")) {
        return "warning";
    }

    const mq2Val = Number(mq2) || 0;
    if (mq2Val >= 800) return "danger";
    if (mq2Val >= 500) return "alert";
    if (mq2Val >= 200) return "warning";

    return "safe";
}

function getCardBgClass(tone) {
    switch (tone) {
        case "danger": return "card-bg-danger";
        case "alert": return "card-bg-alert";
        case "warning": return "card-bg-warning";
        default: return "card-bg-safe";
    }
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

function trimChart(chart) {
    while (chart.data.labels.length > MAX_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
}

function appendPoint(snapshot) {
    if (!snapshot || snapshot.id <= lastPointId) {
        return;
    }

    const timeLabel = formatChartTime(snapshot.updatedAt);

    airChart.data.labels.push(timeLabel);
    airChart.data.datasets[0].data.push(snapshot.mq135);
    trimChart(airChart);

    mq2Chart.data.labels.push(timeLabel);
    mq2Chart.data.datasets[0].data.push(snapshot.mq2);
    trimChart(mq2Chart);

    lastPointId = snapshot.id;
}

function getChartColor(tone, type) {
    if (type === "mq2") {
        switch (tone) {
            case "danger": return { border: "#f43f5e", bg: "rgba(244, 63, 94, 0.15)" };
            case "alert": return { border: "#f97316", bg: "rgba(249, 115, 22, 0.15)" };
            case "warning": return { border: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)" };
            default: return { border: "#22c55e", bg: "rgba(34, 197, 94, 0.15)" };
        }
    }
    switch (tone) {
        case "danger": return { border: "#f43f5e", bg: "rgba(244, 63, 94, 0.12)" };
        case "alert": return { border: "#f97316", bg: "rgba(249, 115, 22, 0.12)" };
        case "warning": return { border: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)" };
        default: return { border: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)" };
    }
}

function updateChartColors(chart, tone, type) {
    const colors = getChartColor(tone, type);
    chart.data.datasets[0].borderColor = colors.border;
    chart.data.datasets[0].backgroundColor = colors.bg;
}

function renderSnapshot(snapshot, shouldAppend = true) {
    if (!snapshot) {
        return;
    }

    mq2Element.textContent = snapshot.mq2;
    mq135Element.textContent = snapshot.mq135;
    statusElement.textContent = snapshot.gasStatus;
    wifiElement.textContent = "House 1";

    const tone = getStatusTone(snapshot.gasStatus, snapshot.mq2);
    const ledIsOn = String(snapshot.led || "").toUpperCase() === "ON";

    if (ledIsOn) {
        if (tone === "danger" || tone === "alert") {
            ledElement.textContent = "RED";
            ledElement.className = "danger";
        } else {
            ledElement.textContent = "GREEN";
            ledElement.className = "safe";
        }
    } else {
        ledElement.textContent = "GREEN";
        ledElement.className = "safe";
    }

    buzzerElement.textContent = snapshot.buzzer || "OFF";
    lcdLine1Element.textContent = formatLcdLine(snapshot.lcdLine1, "Smart LPG Ready");
    lcdLine2Element.textContent = formatLcdLine(snapshot.lcdLine2, `MQ135 ${snapshot.mq135} | House 1`);
    lastUpdatedElement.textContent = formatDisplayTime(snapshot.updatedAt);

    const buzzerTone = getActuatorTone(snapshot.buzzer);
    const ledLightTone = (tone === "danger" || tone === "alert") ? "danger" : "safe";

    statusElement.className = tone;
    buzzerElement.className = buzzerTone;
    ledLightElement.className = `indicator-light on ${ledLightTone}`;
    buzzerLightElement.className = `indicator-light ${snapshot.buzzer === "ON" ? "on" : "off"} ${buzzerTone}`;

    const cardBgClass = getCardBgClass(tone);
    statusCardElement.className = `card ${cardBgClass}`;

    if (tone === "danger") {
        ledCardElement.className = "card card-bg-danger";
    } else {
        ledCardElement.className = "card card-bg-safe";
    }

    statusDetailElement.textContent =
        tone === "danger" ? "Immediate attention required"
        : tone === "alert" ? "High gas levels detected"
        : tone === "warning" ? "Conditions need checking"
        : "System is stable";
    ledDetailElement.textContent =
        tone === "danger" ? "Danger indicator active"
        : tone === "alert" ? "Warning indicator active"
        : "Indicator is active (Normal)";
    buzzerDetailElement.textContent =
        buzzerTone === "danger" ? "Alarm is sounding" : "Alarm is silent";

    if (shouldAppend) {
        appendPoint(snapshot);
    } else {
        lastPointId = Math.max(lastPointId, snapshot.id || 0);
    }

    updateChartColors(airChart, tone, "mq135");
    updateChartColors(mq2Chart, tone, "mq2");

    airChart.update("none");
    mq2Chart.update("none");
}

function createChart(ctx, label, borderColor, bgColor, yMax) {
    return new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                {
                    label: label,
                    data: [],
                    borderColor: borderColor,
                    backgroundColor: bgColor,
                    tension: 0.35,
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHitRadius: 14,
                    fill: true,
                    capBezierPoints: true,
                    borderJoinStyle: "round"
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
                        color: "#a1a1aa",
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8
                    },
                    grid: {
                        color: "rgba(255, 255, 255, 0.06)",
                        drawBorder: false
                    }
                },
                y: {
                    beginAtZero: true,
                    suggestedMin: 0,
                    suggestedMax: yMax,
                    ticks: {
                        color: "#a1a1aa",
                        stepSize: Math.ceil(yMax / 5)
                    },
                    grid: {
                        color: "rgba(255, 255, 255, 0.06)",
                        drawBorder: false
                    }
                }
            },
            layout: {
                padding: {
                    top: 10,
                    right: 10,
                    bottom: 10,
                    left: 10
                }
            },
            elements: {
                line: {
                    cubicInterpolationMode: "monotone"
                }
            }
        }
    });
}

const airChart = createChart(airCtx, "MQ135", "#38bdf8", "rgba(56, 189, 248, 0.12)", 500);
const mq2Chart = createChart(mq2Ctx, "MQ2", "#22c55e", "rgba(34, 197, 94, 0.15)", 1024);

async function loadHistory() {
    const response = await fetch("/api/history");
    const history = await response.json();

    airChart.data.labels = [];
    airChart.data.datasets[0].data = [];
    mq2Chart.data.labels = [];
    mq2Chart.data.datasets[0].data = [];
    lastPointId = 0;

    history.slice(-MAX_POINTS).forEach((snapshot) => {
        appendPoint(snapshot);
    });

    if (history.length > 0) {
        renderSnapshot(history[history.length - 1], false);
    } else {
        airChart.update("none");
        mq2Chart.update("none");
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
