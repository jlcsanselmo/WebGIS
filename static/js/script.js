document.addEventListener("DOMContentLoaded", function () {
    let drawnPolygon = null;
    let areaChart = null;
    let clickedFeature = null;
    let geojsonLayer = null;

    const map = L.map('map').setView([-10, -53], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

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
        edit: { featureGroup: drawnItems }
    });
    map.addControl(drawControl);

    // Polígono visível
    document.getElementById('togglePolygon').addEventListener('change', function (e) {
        if (drawnPolygon) {
            e.target.checked ? drawnItems.addLayer(drawnPolygon) : drawnItems.removeLayer(drawnPolygon);
        }
    });

    // Desenho manual
    map.on(L.Draw.Event.CREATED, function (e) {
        drawnItems.clearLayers();
        drawnPolygon = e.layer;
        clickedFeature = null;
        drawnItems.addLayer(drawnPolygon);
        document.getElementById('polygonToggleContainer').style.display = 'block';
        loadMapbiomasTile(getGeometryOnly(drawnPolygon.toGeoJSON().geometry));
    });

    // Gera gráfico
    document.getElementById("showChartBtn").addEventListener("click", function () {
        let geometry = drawnPolygon
            ? getGeometryOnly(drawnPolygon.toGeoJSON().geometry)
            : clickedFeature
            ? getGeometryOnly(clickedFeature)
            : null;

        if (!geometry) {
            alert("Desenhe ou selecione um polígono primeiro.");
            return;
        }

        fetch("/get_chart", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geometry)
        })
            .then(response => response.json())
            .then(data => {
                const ctx = document.getElementById("areaChart").getContext("2d");
                if (areaChart) areaChart.destroy();

                areaChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: data.labels,
                        datasets: [{
                            label: 'Área (ha)',
                            data: data.values,
                            backgroundColor: data.colors,
                            borderColor: data.colors,
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()} ha`
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: { display: true, text: 'Área (hectares)' }
                            }
                        }
                    }
                });

                new bootstrap.Modal(document.getElementById('chartModal')).show();
            })
            .catch(error => console.error("Erro ao buscar gráfico:", error));
    });

    function loadMapbiomasTile(geojson) {
        if (window.mapbiomasLayer) map.removeLayer(window.mapbiomasLayer);

        fetch("/get_mapbiomas_tile", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geojson)
        })
            .then(res => res.json())
            .then(data => {
                if (data.tile_url) {
                    window.mapbiomasLayer = L.tileLayer(data.tile_url, {
                        attribution: "Fonte: MapBiomas via Earth Engine",
                        opacity: 0.6
                    }).addTo(map);
                }
            })
            .catch(err => console.error("Erro ao carregar tiles do MapBiomas:", err));
    }

    function getGeometryOnly(geometry) {
        return {
            type: geometry.type,
            coordinates: geometry.coordinates
        };
    }

    // Carrega camada do GeoServer sem adicionar ao mapa
    function carregarCamadaGeoServer() {
        fetch("http://localhost:8080/geoserver/sigef/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=sigef:Sigef_Brasil&outputFormat=application/json")
            .then(res => res.json())
            .then(data => {
                geojsonLayer = L.geoJSON(data, {
                    style: { color: 'blue', weight: 1, fillOpacity: 0.1 },
                    onEachFeature: function (feature, layer) {
                        layer.on('click', function () {
                            if (drawnPolygon) map.removeLayer(drawnPolygon);

                            const tempLayer = L.geoJSON(feature, {
                                style: { color: 'red', weight: 2, fillOpacity: 0.3 }
                            });

                            drawnPolygon = tempLayer.getLayers()[0];
                            drawnItems.clearLayers();
                            drawnItems.addLayer(drawnPolygon);
                            document.getElementById('polygonToggleContainer').style.display = 'block';

                            clickedFeature = feature.geometry;

                            new bootstrap.Modal(document.getElementById('confirmModal')).show();
                        });
                    }
                });

                // Verifica estado do checkbox após carregar
                const toggle = document.getElementById("toggleGeoServer");
                if (toggle.checked) {
                    map.addLayer(geojsonLayer);
                }
            })
            .catch(err => console.error("Erro ao carregar camada GeoServer:", err));
    }

    // Inicia com o checkbox desligado e define comportamento
    const geoToggle = document.getElementById("toggleGeoServer");
    geoToggle.checked = false;
    geoToggle.addEventListener("change", function (e) {
        if (!geojsonLayer) return;
        if (e.target.checked) {
            map.addLayer(geojsonLayer);
        } else {
            map.removeLayer(geojsonLayer);
        }
    });

    // Confirmação modal
    document.getElementById("confirmClipBtn").addEventListener("click", function () {
        if (!clickedFeature) return;

        loadMapbiomasTile(getGeometryOnly(clickedFeature));

        const modalEl = document.getElementById('confirmModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
    });

    carregarCamadaGeoServer();

    window.addEventListener('load', () => {
        setTimeout(() => map.invalidateSize(), 200);
    });
});
