from flask import Flask, render_template, request, jsonify
import ee

# Inicializa o Earth Engine
try:
    ee.Initialize()
except Exception:
    ee.Authenticate()
    ee.Initialize(project='ee-jlcsanselmo')

app = Flask(__name__)

# Dicionário oficial de classes do MapBiomas
MAPBIOMAS_CLASSES = {
    0: {'nome': 'Não Classificado', 'cor': '#ffffff'},
    1: {'nome': 'Floresta', 'cor': '#1f8d49'},
    3: {'nome': 'Formação Florestal', 'cor': '#1f8d49'},
    4: {'nome': 'Formação Savânica', 'cor': '#7dc975'},
    5: {'nome': 'Mangue', 'cor': '#04381d'},
    6: {'nome': 'Floresta Alagável', 'cor': '#007785'},
    9: {'nome': 'Silvicultura', 'cor': '#7a5900'},
    10: {'nome': 'Vegetação Herbácea e Arbustiva', 'cor': '#d6bc74'},
    11: {'nome': 'Campo Alagado e Área Pantanosa', 'cor': '#519799'},
    12: {'nome': 'Formação Campestre', 'cor': '#d6bc74'},
    14: {'nome': 'Agropecuária', 'cor': '#ffefc3'},
    15: {'nome': 'Pastagem', 'cor': '#edde8e'},
    18: {'nome': 'Agricultura', 'cor': '#E974ED'},
    19: {'nome': 'Lavoura Temporária', 'cor': '#C27BA0'},
    20: {'nome': 'Cana', 'cor': '#db7093'},
    21: {'nome': 'Mosaico de Usos', 'cor': '#ffefc3'},
    22: {'nome': 'Área Não Vegetada', 'cor': '#d4271e'},
    23: {'nome': 'Praia, Duna e Areal', 'cor': '#ffa07a'},
    24: {'nome': 'Área Urbanizada', 'cor': '#d4271e'},
    25: {'nome': 'Outras Áreas Não Vegetadas', 'cor': '#db4d4f'},
    26: {'nome': 'Corpo D’água', 'cor': '#2532e4'},
    27: {'nome': 'Não Observado', 'cor': '#ffffff'},
    29: {'nome': 'Afloramento Rochoso', 'cor': '#ffaa5f'},
    30: {'nome': 'Mineração', 'cor': '#9c0027'},
    31: {'nome': 'Aquicultura', 'cor': '#091077'},
    32: {'nome': 'Apicum', 'cor': '#fc8114'},
    33: {'nome': 'Rio, Lago e Oceano', 'cor': '#2532e4'},
    35: {'nome': 'Dendê', 'cor': '#9065d0'},
    36: {'nome': 'Lavoura Perene', 'cor': '#d082de'},
    39: {'nome': 'Soja', 'cor': '#f5b3c8'},
    40: {'nome': 'Arroz', 'cor': '#c71585'},
    41: {'nome': 'Outras Lavouras Temporárias', 'cor': '#f54ca9'},
    46: {'nome': 'Café', 'cor': '#d68fe2'},
    47: {'nome': 'Citrus', 'cor': '#9932cc'},
    48: {'nome': 'Outras Lavouras Perenes', 'cor': '#e6ccff'},
    49: {'nome': 'Restinga Arbórea', 'cor': '#02d659'},
    50: {'nome': 'Restinga Herbácea', 'cor': '#ad5100'},
    62: {'nome': 'Algodão (beta)', 'cor': '#ff69b4'}
}


def strip_third_dimension(coords):
    """Remove a terceira dimensão das coordenadas"""
    return [[ [pt[:2] for pt in ring] for ring in polygon ] for polygon in coords]

def parse_geometry(geojson):
    print("GeoJSON recebido:", geojson)

    if not geojson or 'type' not in geojson or 'coordinates' not in geojson:
        raise ValueError(f"GeoJSON inválido ou incompleto: {geojson}")

    geo_type = geojson['type']
    coords = geojson['coordinates']

    if geo_type == 'Polygon':
        cleaned_coords = [[pt[:2] for pt in ring] for ring in coords]
        return ee.Geometry.Polygon(cleaned_coords)
    elif geo_type == 'MultiPolygon':
        cleaned_coords = strip_third_dimension(coords)
        return ee.Geometry.MultiPolygon(cleaned_coords)
    else:
        raise ValueError(f"Tipo de geometria não suportado: {geo_type}")


def get_mapbiomas_data(geojson):
    try:
        geometry = parse_geometry(geojson)

        mapbiomas = ee.Image("projects/mapbiomas-public/assets/brazil/lulc/collection9/mapbiomas_collection90_integration_v1")
        bands = mapbiomas.select("classification_2023")
        clipped = bands.clip(geometry)

        area_image = ee.Image.pixelArea().addBands(clipped)
        areas = area_image.reduceRegion(
            reducer=ee.Reducer.sum().group(groupField=1, groupName='class'),
            geometry=geometry,
            scale=30,
            maxPixels=1e13
        )

        class_areas = areas.get('groups').getInfo()
        data = [{"class": item['class'], "area": item['sum'] / 10000} for item in class_areas]
        return data

    except Exception as e:
        print(f"[ERRO] get_mapbiomas_data: {e}")
        return []


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/get_chart", methods=["POST"])
def get_chart():
    try:
        geojson = request.get_json(force=True)

        if not geojson or 'coordinates' not in geojson:
            return jsonify({"error": "GeoJSON inválido"}), 400

        data = get_mapbiomas_data(geojson)

        if not data:
            return jsonify({"error": "Não foi possível processar os dados"}), 500

        labels = [MAPBIOMAS_CLASSES.get(d['class'], {}).get('nome', f"Classe {d['class']}") for d in data]
        values = [round(d['area'], 2) for d in data]
        colors = [MAPBIOMAS_CLASSES.get(d['class'], {}).get('cor', '#cccccc') for d in data]
        class_ids = [d['class'] for d in data]

        return jsonify({
            "labels": labels,
            "values": values,
            "colors": colors,
            "class_ids": class_ids
        })

    except Exception as e:
        print(f"[ERRO] /get_chart: {e}")
        return jsonify({"error": "Erro interno no servidor"}), 500


@app.route("/get_mapbiomas_tile", methods=["POST"])
def get_mapbiomas_tile():
    try:
        geojson = request.get_json(force=True)
        if not geojson or 'coordinates' not in geojson:
            return jsonify({"error": "GeoJSON inválido"}), 400

        geometry = parse_geometry(geojson)

        mapbiomas = ee.Image("projects/mapbiomas-public/assets/brazil/lulc/collection9/mapbiomas_collection90_integration_v1")
        band = mapbiomas.select("classification_2023")
        clipped = band.clip(geometry)

        palette = [MAPBIOMAS_CLASSES.get(i, {}).get('cor', '#000000').replace('#', '') for i in range(63)]

        vis_params = {
            'min': 0,
            'max': 62,
            'palette': palette
        }

        map_id = clipped.getMapId(vis_params)

        return jsonify({
            "tile_url": map_id['tile_fetcher'].url_format
        })

    except Exception as e:
        print(f"[ERRO] /get_mapbiomas_tile: {e}")
        return jsonify({"error": "Erro interno no servidor"}), 500


if __name__ == "__main__":
    app.run(debug=True)