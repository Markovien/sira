import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from './theme';

/**
 * Signature au doigt, gardee comme trace SVG : quelques Ko de texte plutot
 * qu'une image (decisions.md, 26/10/2026).
 */
export interface Signature {
  readonly width: number;
  readonly height: number;
  readonly path: string;
}

export function SignaturePad({
  onChange,
}: {
  onChange: (signature: Signature | null) => void;
}) {
  const [path, setPath] = useState('');
  const size = useRef({ width: 0, height: 0 });
  const pathRef = useRef('');

  const update = (next: string) => {
    pathRef.current = next;
    setPath(next);
    onChange(next ? { ...size.current, path: next } : null);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Garder le geste : un trace un peu vertical ne doit pas etre repris
      // par le defilement de la page.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const { locationX: x, locationY: y } = event.nativeEvent;
        update(`${pathRef.current} M${x.toFixed(0)} ${y.toFixed(0)}`.trim());
      },
      onPanResponderMove: (event) => {
        const { locationX: x, locationY: y } = event.nativeEvent;
        update(`${pathRef.current} L${x.toFixed(0)} ${y.toFixed(0)}`);
      },
    }),
  ).current;

  return (
    <View
      style={styles.pad}
      onLayout={(event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        size.current = { width: Math.round(width), height: Math.round(height) };
      }}
      {...responder.panHandlers}
    >
      <Svg width="100%" height="100%">
        <Path d={path} stroke={colors.text} strokeWidth={3} fill="none" />
      </Svg>
    </View>
  );
}

/** Signature enregistree, redessinee a l'echelle de son pave d'origine. */
export function SignaturePreview({ signature }: { signature: Signature }) {
  return (
    <View style={[styles.pad, { height: 120 }]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${signature.width} ${signature.height}`}>
        <Path d={signature.path} stroke={colors.text} strokeWidth={3} fill="none" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    height: 200,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
});
