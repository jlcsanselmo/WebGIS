document.addEventListener("DOMContentLoaded", function () {
    let drawnPolygon = null;
    let areaChart = null;
    let clickedFeature = null;
    let geojsonLayer = null;

    // Botões e controles
    const showChartBtn = document.getElementById("showChartBtn");
    const clearSelectionBtn = document.getElementById("clearSelectionBtn");
    const confirmRemoveBtn = document.getElementById("confirmRemoveBtn");
    const toggleOpacityBtn = document.getElementById("toggleOpacityBtn");
    const opacityControl = document.getElementById("opacityControl");
    const opacitySlider = document.getElementById("opacitySlider");

    // Base layers
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    });

    const esriLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri'
    });

    const map = L.map('map', {
        center: [-15.78, -47.93],
        zoom: 5,
        layers: [osmLayer]
    });

    let currentBaseLayer = osmLayer;

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

    const togglePolygon = document.getElementById('togglePolygon');
    if (togglePolygon) {
        togglePolygon.addEventListener('change', function (e) {
            if (drawnPolygon) {
                e.target.checked ? drawnItems.addLayer(drawnPolygon) : drawnItems.removeLayer(drawnPolygon);
            }
        });
    }

    // Ao desenhar um polígono
    map.on(L.Draw.Event.CREATED, function (e) {
        drawnItems.clearLayers();
        drawnPolygon = e.layer;
        clickedFeature = null;
        drawnItems.addLayer(drawnPolygon);

        document.getElementById('polygonToggleContainer').style.display = 'block';
        showChartBtn.style.display = 'block';
        clearSelectionBtn.style.display = 'block';
        toggleOpacityBtn.style.display = 'block';

        loadMapbiomasTile(getGeometryOnly(drawnPolygon.toGeoJSON().geometry));
    });

   // Botão "Ver gráfico"
showChartBtn.addEventListener("click", function () {
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

            // ✅ Geração da tabela com os dados
            const tableContainer = document.getElementById("tableContainer");
            let tableHTML = `
              <table class="table table-striped table-bordered mt-4">
                <thead class="table-dark">
                  <tr>
                    <th>Classe</th>
                    <th>Área (ha)</th>
                  </tr>
                </thead>
                <tbody>
            `;

            for (let i = 0; i < data.labels.length; i++) {
              tableHTML += `
                <tr>
                  <td>${data.labels[i]}</td>
                  <td>${data.values[i].toLocaleString()}</td>
                </tr>
              `;
            }

            tableHTML += `
                </tbody>
              </table>
            `;

            tableContainer.innerHTML = tableHTML;

            // Exibe o modal com gráfico + tabela
            new bootstrap.Modal(document.getElementById('chartModal')).show();
        })
        .catch(error => console.error("Erro ao buscar gráfico:", error));
});


    // Carrega tile do MapBiomas
    function loadMapbiomasTile(geojson) {
        if (window.mapbiomasLayer) {
            map.removeLayer(window.mapbiomasLayer);
        }

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
                        opacity: parseFloat(opacitySlider.value)
                    });

                    window.mapbiomasLayer.addTo(map).bringToFront();
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

    // Clicar em um polígono do GeoServer
    function carregarCamadaGeoServer() {
        fetch("http://localhost:8080/geoserver/sigef/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=sigef:Sigef_Brasil&outputFormat=application/json")
            .then(res => res.json())
            .then(data => {
                geojsonLayer = L.geoJSON(data, {
                    style: { color: 'blue', weight: 1, fillOpacity: 0.1 },
                    onEachFeature: function (feature, layer) {
                        layer.on('click', function () {
                            drawnItems.clearLayers();

                            const tempLayer = L.geoJSON(feature, {
                                style: { color: 'red', weight: 2, fillOpacity: 0.3 }
                            });

                            drawnPolygon = tempLayer.getLayers()[0];
                            drawnItems.addLayer(drawnPolygon);

                            document.getElementById('polygonToggleContainer').style.display = 'block';
                            clickedFeature = feature.geometry;

                            showChartBtn.style.display = 'block';
                            clearSelectionBtn.style.display = 'block';
                            toggleOpacityBtn.style.display = 'block';

                            new bootstrap.Modal(document.getElementById('confirmModal')).show();
                        });
                    }
                });

                const toggle = document.getElementById("toggleGeoServer");
                if (toggle && toggle.checked) {
                    map.addLayer(geojsonLayer);
                }
            })
            .catch(err => console.error("Erro ao carregar camada GeoServer:", err));
    }

    // Alternância camada GeoServer
    const geoToggle = document.getElementById("toggleGeoServer");
    geoToggle.checked = false;
    geoToggle.addEventListener("change", function (e) {
        if (!geojsonLayer) return;
        e.target.checked ? map.addLayer(geojsonLayer) : map.removeLayer(geojsonLayer);
    });

    // Confirma recorte
    const confirmClipBtn = document.getElementById("confirmClipBtn");
    if (confirmClipBtn) {
        confirmClipBtn.addEventListener("click", function () {
            if (!clickedFeature) return;

            loadMapbiomasTile(getGeometryOnly(clickedFeature));

            const modalEl = document.getElementById('confirmModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        });
    }

    // Remoção de polígono (confirmação)
    clearSelectionBtn.addEventListener("click", function () {
        const modalEl = document.getElementById('removePolygonModal');
        if (modalEl) {
            new bootstrap.Modal(modalEl).show();
        }
    });

    confirmRemoveBtn.addEventListener("click", function () {
        drawnItems.clearLayers();
        drawnPolygon = null;
        clickedFeature = null;

        showChartBtn.style.display = 'none';
        clearSelectionBtn.style.display = 'none';
        toggleOpacityBtn.style.display = 'none';
        opacityControl.style.display = 'none';

        document.getElementById('polygonToggleContainer').style.display = 'none';

        if (window.mapbiomasLayer) {
            map.removeLayer(window.mapbiomasLayer);
            window.mapbiomasLayer = null;
        }

        const modalEl = document.getElementById('removePolygonModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    });

    // Botão de alternância de opacidade
    if (toggleOpacityBtn) {
        toggleOpacityBtn.addEventListener('click', function () {
            opacityControl.style.display =
                (opacityControl.style.display === 'none' || opacityControl.style.display === '')
                    ? 'block'
                    : 'none';
        });
    }

    // Controle de opacidade do MapBiomas
    if (opacitySlider) {
        opacitySlider.addEventListener('input', function (e) {
            if (window.mapbiomasLayer) {
                window.mapbiomasLayer.setOpacity(parseFloat(e.target.value));
            }
        });
    }

    // Base map toggle
    document.getElementById('btnToggleBasemap').addEventListener('click', () => {
        const dropdown = document.getElementById('basemapOptions');
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    document.querySelectorAll('.basemap-option').forEach(option => {
        option.addEventListener('click', function () {
            const selected = this.getAttribute('data-map');
            map.removeLayer(currentBaseLayer);

            currentBaseLayer = selected === 'osm' ? osmLayer : esriLayer;
            map.addLayer(currentBaseLayer);

            if (window.mapbiomasLayer) {
                map.removeLayer(window.mapbiomasLayer);
                window.mapbiomasLayer.addTo(map).bringToFront();
            }

            document.getElementById('basemapOptions').style.display = 'none';
        });
    });

    // Inicializa camada GeoServer
    carregarCamadaGeoServer();

    // Ajusta tamanho do mapa em resize
    map.on('resize', () => {
        map.invalidateSize();
    });

    // Gera a tabela de dados
const tableContainer = document.getElementById("tableContainer");
let tableHTML = `
  <table class="table table-striped table-bordered">
    <thead class="table-dark">
      <tr>
        <th>Classe</th>
        <th>Área (ha)</th>
      </tr>
    </thead>
    <tbody>
`;

for (let i = 0; i < data.labels.length; i++) {
  tableHTML += `
    <tr>
      <td>${data.labels[i]}</td>
      <td>${data.values[i].toLocaleString()}</td>
    </tr>
  `;
}

tableHTML += `
    </tbody>
  </table>
`;

tableContainer.innerHTML = tableHTML;

});
