import { Camera, GeoJSONSource, Layer, Map as MapView } from '@maplibre/maplibre-react-native';
import type { Coordinates } from '@sira/shared';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ATTRIBUTION,
  cameraBounds,
  LABEL_FONT,
  longPressPoint,
  offlineMapStyle,
  routeLine,
  stopFeatures,
} from './core/map-style';
import type { DisplayedStop } from './core/mission-view';
import { colors, spacing, typography } from './theme';

/**
 * Carte d'une tournee : arrets numerotes comme la liste, trace des arrets
 * restants, appui long pour ajouter un arret. Tout est lu sur le telephone.
 */
export function StopsMap({
  stops,
  archiveUri,
  onLongPress,
}: {
  stops: readonly DisplayedStop[];
  archiveUri: string | null;
  /** Absent : l'appui long ne fait rien (livreur sans droit d'edition). */
  onLongPress?: (point: Coordinates) => void;
}) {
  const style = useMemo(() => offlineMapStyle(archiveUri), [archiveUri]);
  const points = useMemo(() => stopFeatures(stops), [stops]);
  const line = useMemo(() => routeLine(stops), [stops]);
  const bounds = useMemo(() => cameraBounds(stops.map(({ stop }) => stop)), [stops]);

  return (
    <View style={styles.container} testID="stops-map">
      <MapView
        style={styles.map}
        mapStyle={style}
        // Mention ODbL affichee en clair ci-dessous, plus lisible que le
        // bouton (i) du moteur ; logo et boussole n'apportent rien au livreur.
        attribution={false}
        logo={false}
        compass={false}
        onLongPress={(event) => {
          const point = longPressPoint(event.nativeEvent.lngLat);
          if (point && onLongPress) onLongPress(point);
        }}
      >
        <Camera
          initialViewState={{
            bounds,
            padding: { top: 48, right: 48, bottom: 48, left: 48 },
          }}
          minZoom={9}
          maxZoom={18}
        />
        <GeoJSONSource id="route" data={line}>
          <Layer
            type="line"
            id="route-line"
            paint={{ 'line-color': colors.primary, 'line-width': 4, 'line-opacity': 0.7 }}
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          />
        </GeoJSONSource>
        <GeoJSONSource id="stops" data={points}>
          <Layer
            type="circle"
            id="stops-circle"
            paint={{
              'circle-radius': 14,
              'circle-color': ['case', ['get', 'pending'], colors.primary, colors.textMuted],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            }}
          />
          <Layer
            type="symbol"
            id="stops-rank"
            layout={{
              'text-field': ['to-string', ['get', 'rank']],
              'text-font': [LABEL_FONT],
              'text-size': 14,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
            paint={{ 'text-color': '#ffffff' }}
          />
        </GeoJSONSource>
      </MapView>
      <Text style={styles.attribution}>{ATTRIBUTION}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 320 },
  map: { flex: 1 },
  attribution: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    paddingHorizontal: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.8)',
    color: colors.text,
    fontSize: typography.body - 4,
  },
});
