let drawnPolygon = null;
let areaChart = null; // gráfico global para destruir antes de redesenhar

// Inicializa o mapa centralizado no Brasil
const map = L.map('map').setView([-10, -53], 4);

// Camada base do OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Grupo para armazenar os polígonos desenhados
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Controle de desenho
const drawControl = new L.Control.Draw({
    draw: {
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
        polygon: {
            allowIntersection: false,
            showArea: true
        }
    },
    edit: {
        featureGroup: drawnItems
    }
});
map.addControl(drawControl);

// Evento de criação de polígono
map.on(L.Draw.Event.CREATED, function (e) {
    drawnItems.clearLayers();
    drawnPolygon = e.layer;
    drawnItems.addLayer(drawnPolygon);
    document.getElementById('polygonToggleContainer').style.display = 'block';

    // Controle de visibilidade do polígono
document.getElementById('togglePolygon').addEventListener('change', function (e) {
    if (drawnPolygon) {
        if (e.target.checked) {
            drawnPolygon.addTo(drawnItems);
        } else {
            drawnItems.removeLayer(drawnPolygon);
        }
    }
});

    // Remove camada anterior do MapBiomas se houver
    if (window.mapbiomasLayer) {
        map.removeLayer(window.mapbiomasLayer);
    }

    const geojson = drawnPolygon.toGeoJSON().geometry;

    // Requisição para obter a imagem recortada do MapBiomas
    fetch("/get_mapbiomas_tile", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(geojson)
    })
    .then(response => response.json())
    .then(data => {
        if (data.tile_url) {
            window.mapbiomasLayer = L.tileLayer(data.tile_url, {
                attribution: "Fonte: MapBiomas via Earth Engine",
                opacity: 0.6
            }).addTo(map);
        } else {
            console.error("Erro ao carregar imagem do MapBiomas:", data.error);
        }
    })
    .catch(error => console.error("Erro ao buscar camada MapBiomas:", error));
});

// Botão para gerar gráfico
document.getElementById("showChartBtn").addEventListener("click", function () {
    if (!drawnPolygon) {
        alert("Desenhe um polígono primeiro.");
        return;
    }

    const geojson = drawnPolygon.toGeoJSON().geometry;

    fetch("/get_chart", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(geojson)
    })
    .then(response => response.json())
    .then(data => {
        const labels = data.labels;
        const values = data.values;
        const colors = data.colors;

        const ctx = document.getElementById("areaChart").getContext("2d");

        // Destrói gráfico anterior se houver
        if (areaChart) {
            areaChart.destroy();
        }

        // Cria novo gráfico
        areaChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Área (ha)',
                    data: values,
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return `${context.dataset.label}: ${context.parsed.y.toLocaleString()} ha`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                return value.toLocaleString();
                            }
                        },
                        title: {
                            display: true,
                            text: 'Área (hectares)'
                        }
                    }
                }
            }
        });

        // Exibe modal com gráfico
        new bootstrap.Modal(document.getElementById('chartModal')).show();
    })
    .catch(error => console.error("Erro ao buscar gráfico:", error));
});

// Ajusta mapa após carregamento da página
window.addEventListener('load', function () {
    setTimeout(() => {
        map.invalidateSize();
    }, 200);
});
