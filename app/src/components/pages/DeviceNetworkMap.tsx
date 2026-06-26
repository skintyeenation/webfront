import React, { useMemo, useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Circle, G, Path } from 'react-native-svg';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { hierarchy, tree, HierarchyPointNode } from 'd3-hierarchy';
import { linkVertical } from 'd3-shape';
import { theme } from 'skintyee/styles';
import { DeviceDto } from 'skintyee/services/api/ApiService';
import { deviceIcon } from 'skintyee/components/pages/Devices';
import { complianceState, COMPLIANCE_UI, isServer } from 'skintyee/components/pages/device-os';

// ----------------------------------------------------------------------------
// DeviceNetworkMap — a top-down tree of the Entra estate showing HOW each
// device relates to Entra, the on-prem DC, and the domain (ADR-16 hybrid
// identity). Layout per join type (trustType):
//
//   Skin Tyee · Entra tenant (cloud)
//     ├─ STFN-DC  ── "Entra Connect sync" (dashed) ── on-prem domain controller
//     │    └─ Hybrid-joined PCs           (domain-joined, managed by GP on the DC)
//     ├─ Workplace devices                (Entra-registered only — dotted)
//     └─ AzureAd devices                  (cloud-only Entra joined — dashed)
//
// The DC is detected by name (…-DC…), not trustType (Graph reports the DC as
// Workplace until/unless it's itself hybrid-joined). Edge STYLE + the legend
// convey the relationship; the unique Entra Connect sync edge is also labelled.
//
// Layout is delegated to d3-hierarchy (`hierarchy()` + `tree()`); connectors use
// d3-shape's `linkVertical()`. The canvas is centred in the viewport via
// onLayout (minWidth = container width) and only scrolls when it overflows.
// Tapping a device leaf → DeviceDetail.
// ----------------------------------------------------------------------------

type NodeKind = 'root' | 'group' | 'device';
type EdgeKind = 'sync' | 'domain' | 'registered' | 'cloud-join';

interface MapNode {
  key: string;
  kind: NodeKind;
  label: string;
  sub?: string;
  edgeKind?: EdgeKind;        // relationship to the parent (drives edge style)
  linkLabel?: string;        // text drawn on the edge from the parent
  device?: DeviceDto;        // present for kind === 'device'
  children?: MapNode[];
}

// Layout constants (pixels).
const NODE_V_GAP = 132;      // vertical distance between tree depths
const LEAF_W = 150;          // nominal horizontal slot per device leaf
const PAD_X = 24;
const PAD_TOP = 52;          // room so the root node (r=26) + icon isn't clipped
const PAD_BOTTOM = 64;       // room for the legend
const ROOT_R = 26;
const GROUP_R = 22;
const LEAF_R = 20;

// Edge appearance per relationship kind. dash is an SVG strokeDasharray string.
const EDGE_STYLE: Record<EdgeKind, { stroke: string; dash?: string; width: number }> = {
  sync:         { stroke: theme.colors.accent,     dash: '7,5', width: 2.5 }, // Entra Connect
  domain:       { stroke: theme.colors.primary,    width: 1.75 },             // domain-joined (solid)
  registered:   { stroke: theme.colors.textDarker, dash: '2,5', width: 1.5 }, // registered only
  'cloud-join': { stroke: theme.colors.success,    dash: '7,5', width: 1.5 }, // Entra joined
};

interface Props {
  devices: DeviceDto[];
  navigation: any;
}

export default function DeviceNetworkMap({ devices, navigation }: Props) {
  // Viewport width (for centring). 0 until first layout.
  const [containerW, setContainerW] = useState(0);

  const { laidOut, width, canvasWidth, height } = useMemo(() => {
    // 1. Build the nested data the way d3-hierarchy expects.
    const deviceLeaf = (d: DeviceDto, edgeKind?: EdgeKind): MapNode => ({
      key: `dev-${d.id}`,
      kind: 'device' as const,
      label: d.displayName,
      device: d,
      edgeKind,
    });

    // The DC is the on-prem hub. Detected by name (e.g. STFN-DC), NOT trustType
    // — Graph reports the DC itself as Workplace/null.
    const isDomainController = (name: string) =>
      /\bdc\d*\b/i.test((name ?? '').replace(/[-_]/g, ' '));

    const dc = devices.find((d) => isDomainController(d.displayName));
    const nonDc = devices.filter((d) => d.id !== dc?.id);

    // Place strictly by join type.
    const hybrid = nonDc.filter((d) => d.trustType === 'Hybrid');     // domain-joined → under DC
    const registered = nonDc.filter((d) => d.trustType === 'Workplace'); // registered → under Entra
    const cloud = nonDc.filter((d) => d.trustType === 'AzureAd');     // cloud-only → under Entra

    const rootChildren: MapNode[] = [];
    if (dc) {
      rootChildren.push({
        ...deviceLeaf(dc, 'sync'),
        sub: 'domain controller',
        linkLabel: 'Entra Connect sync',
        children: hybrid.map((d) => deviceLeaf(d, 'domain')),
      });
    } else if (hybrid.length) {
      // No DC object in Entra yet, but we have domain/hybrid machines — show a
      // domain group hub so the sync relationship still reads.
      rootChildren.push({
        key: 'group-domain',
        kind: 'group',
        label: 'STFN.local domain',
        sub: 'on-prem',
        edgeKind: 'sync',
        linkLabel: 'Entra Connect sync',
        children: hybrid.map((d) => deviceLeaf(d, 'domain')),
      });
    }
    for (const d of registered) rootChildren.push(deviceLeaf(d, 'registered'));
    for (const d of cloud) rootChildren.push(deviceLeaf(d, 'cloud-join'));

    const data: MapNode = {
      key: 'root',
      kind: 'root',
      label: 'Skin Tyee',
      sub: 'Entra tenant · skintyee.ca',
      children: rootChildren,
    };

    // 2. Lay it out with d3-hierarchy. nodeSize gives a fixed slot per node.
    const root = hierarchy<MapNode>(data, (n) => n.children);
    const layout = tree<MapNode>().nodeSize([LEAF_W, NODE_V_GAP]);
    layout(root);

    const nodes = root.descendants() as HierarchyPointNode<MapNode>[];

    // d3 centres x on 0 and can go negative — normalise into the canvas.
    const xs = nodes.map((n) => n.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const offsetX = PAD_X - minX;

    const w = Math.max((maxX - minX) + PAD_X * 2, 320);
    const maxDepth = Math.max(...nodes.map((n) => n.depth));
    const h = PAD_TOP + maxDepth * NODE_V_GAP + PAD_BOTTOM + 36;

    // Centre the tree in the viewport: if the canvas is narrower than the
    // container, shift every node right by half the slack (so it sits centred);
    // otherwise it fills its natural width and scrolls.
    const centerShift = Math.max(0, (containerW - w) / 2);
    const effectiveWidth = Math.max(w, containerW);

    const place = (n: HierarchyPointNode<MapNode>) => ({
      node: n,
      x: n.x + offsetX + centerShift,
      y: PAD_TOP + n.y,
    });

    return { laidOut: nodes.map(place), width: effectiveWidth, canvasWidth: w, height: h };
  }, [devices, containerW]);

  // d3-shape link generator: a smooth vertical SVG path between two {x, y}.
  const link = useMemo(
    () =>
      linkVertical<unknown, { x: number; y: number }>()
        .x((d) => d.x)
        .y((d) => d.y),
    [],
  );

  const byKey = useMemo(() => {
    const m = new Map<string, (typeof laidOut)[number]>();
    laidOut.forEach((p) => m.set(p.node.data.key, p));
    return m;
  }, [laidOut]);

  const radiusFor = (kind: NodeKind) =>
    kind === 'root' ? ROOT_R : kind === 'group' ? GROUP_R : LEAF_R;

  const ringFor = (p: (typeof laidOut)[number]): string => {
    const { node } = p;
    if (node.data.kind === 'root') return theme.colors.primary;
    if (node.data.kind === 'group') return theme.colors.accent;
    const cs = complianceState(node.data.device?.isCompliant, node.data.device?.isManaged);
    return cs === 'compliant'
      ? theme.colors.success
      : cs === 'noncompliant'
        ? theme.colors.error
        : theme.colors.accent; // 'unknown' = no Intune policy → amber/orange
  };

  return (
    <View style={{ marginTop: 16 }} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
      <ScrollView horizontal showsHorizontalScrollIndicator={canvasWidth > containerW}>
        <ScrollView showsVerticalScrollIndicator contentContainerStyle={{ height }} style={{ width }}>
          <View style={{ width, height }}>
            {/* SVG: connectors + node rings (non-interactive backdrop). */}
            <Svg width={width} height={height}>
              <G>
                {laidOut.map((p) => {
                  const parent = p.node.parent;
                  if (!parent) return null;
                  const src = byKey.get(parent.data.key);
                  if (!src) return null;
                  const style = EDGE_STYLE[p.node.data.edgeKind ?? 'domain'];
                  const d = link({
                    source: { x: src.x, y: src.y + radiusFor(src.node.data.kind) },
                    target: { x: p.x, y: p.y - radiusFor(p.node.data.kind) },
                  });
                  return (
                    <Path
                      key={`edge-${p.node.data.key}`}
                      d={d ?? undefined}
                      stroke={style.stroke}
                      strokeWidth={style.width}
                      strokeDasharray={style.dash}
                      fill="none"
                    />
                  );
                })}
              </G>
              <G>
                {laidOut.map((p) => {
                  const r = radiusFor(p.node.data.kind);
                  const dimmed =
                    p.node.data.kind === 'device' && p.node.data.device?.enabled === false;
                  return (
                    <G key={`node-${p.node.data.key}`} opacity={dimmed ? 0.4 : 1}>
                      <Circle
                        cx={p.x}
                        cy={p.y}
                        r={r}
                        fill={theme.colors.darkDefault}
                        stroke={ringFor(p)}
                        strokeWidth={p.node.data.kind === 'device' ? 3 : 2.5}
                      />
                    </G>
                  );
                })}
              </G>
            </Svg>

            {/* Overlay: edge labels, icons, node labels, tap targets. RN views so
                taps work reliably on web + native. */}

            {/* Edge labels (e.g. "Entra Connect sync") at the edge midpoint. */}
            {laidOut.map((p) => {
              const parent = p.node.parent;
              if (!parent || !p.node.data.linkLabel) return null;
              const src = byKey.get(parent.data.key);
              if (!src) return null;
              const midX = (src.x + p.x) / 2;
              const midY = (src.y + p.y) / 2;
              return (
                <View
                  key={`elabel-${p.node.data.key}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: midX - 70,
                    top: midY - 9,
                    width: 140,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.accent,
                      fontSize: 9,
                      fontWeight: '700',
                      backgroundColor: theme.colors.darkDefault,
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    {p.node.data.linkLabel}
                  </Text>
                </View>
              );
            })}

            {/* Glyphs + labels — positioned in CANVAS coords for every node
                (NOT nested inside the tap target, which would re-anchor them). */}
            {laidOut.map((p) => {
              const { node } = p;
              const r = radiusFor(node.data.kind);
              const isDevice = node.data.kind === 'device';
              const dev = node.data.device;
              const server = isDevice && dev ? isServer(dev.operatingSystem, dev.osVersion) : false;
              const dimmed = isDevice && dev?.enabled === false;
              const icon = isDevice && dev
                ? deviceIcon(dev.operatingSystem, dev.osVersion)
                : node.data.kind === 'root'
                  ? 'cloud-outline'
                  : 'server-network';
              const iconColor =
                node.data.kind === 'root'
                  ? theme.colors.primary
                  : node.data.kind === 'group'
                    ? theme.colors.accent
                    : server
                      ? theme.colors.accent
                      : theme.colors.text;

              return (
                <React.Fragment key={`lbl-${node.data.key}`}>
                  {/* Centred glyph over the circle. */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: p.x - r,
                      top: p.y - r,
                      width: r * 2,
                      height: r * 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: dimmed ? 0.5 : 1,
                    }}
                  >
                    <MaterialCommunityIcons name={icon} size={Math.round(r * 0.95)} color={iconColor} />
                  </View>
                  {/* Label below the node. */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: p.x - LEAF_W / 2,
                      top: p.y + r + 4,
                      width: LEAF_W,
                      alignItems: 'center',
                      opacity: dimmed ? 0.5 : 1,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: theme.colors.text,
                        fontSize: isDevice ? 11 : 12,
                        fontWeight: isDevice ? '500' : '700',
                        textAlign: 'center',
                      }}
                    >
                      {node.data.label}
                    </Text>
                    {node.data.sub ? (
                      <Text
                        numberOfLines={1}
                        style={{ color: theme.colors.textDarker, fontSize: 9, textAlign: 'center' }}
                      >
                        {node.data.sub}
                      </Text>
                    ) : null}
                    {isDevice && dev ? (
                      <Text
                        numberOfLines={1}
                        style={{ color: theme.colors.textDarker, fontSize: 9, textAlign: 'center', marginTop: 1 }}
                      >
                        {dev.userCount} {dev.userCount === 1 ? 'user' : 'users'}
                        {(dev.registrationCount ?? 1) > 1 ? `  ·  ${dev.registrationCount} reg` : ''}
                      </Text>
                    ) : null}
                  </View>
                </React.Fragment>
              );
            })}

            {/* Device tap targets — transparent, on top, in canvas coords. */}
            {laidOut.map((p) => {
              const dev = p.node.data.device;
              if (p.node.data.kind !== 'device' || !dev) return null;
              const r = radiusFor(p.node.data.kind);
              return (
                <TouchableOpacity
                  key={`hit-${p.node.data.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Device ${dev.displayName}`}
                  activeOpacity={0.6}
                  onPress={() => navigation.navigate('deviceDetail', { id: dev.id })}
                  style={{
                    position: 'absolute',
                    left: p.x - LEAF_W / 2,
                    top: p.y - r,
                    width: LEAF_W,
                    height: r * 2 + 48,
                  }}
                />
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>

      {/* Legend — compliance (node rings) + relationships (edges). */}
      <View style={{ marginTop: 10, paddingHorizontal: 4 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
          <LegendDot color={theme.colors.success} label={COMPLIANCE_UI.compliant.label} />
          <LegendDot color={theme.colors.error} label={COMPLIANCE_UI.noncompliant.label} />
          <LegendDot color={theme.colors.accent} label={COMPLIANCE_UI.unknown.label} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
          <LegendLine style={EDGE_STYLE.sync} label="Entra Connect sync" />
          <LegendLine style={EDGE_STYLE.domain} label="Domain-joined (Hybrid)" />
          <LegendLine style={EDGE_STYLE.registered} label="Registered" />
          <LegendLine style={EDGE_STYLE['cloud-join']} label="Entra joined" />
        </View>
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 14, marginTop: 4 }}>
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          borderWidth: 3,
          borderColor: color,
          backgroundColor: 'transparent',
          marginRight: 5,
        }}
      />
      <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

// A short line sample (solid or dashed) for the edge legend.
function LegendLine({ style, label }: { style: { stroke: string; dash?: string; width: number }; label: string }) {
  const dashed = !!style.dash;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 14, marginTop: 4 }}>
      <View style={{ width: 18, height: 2, marginRight: 5, flexDirection: 'row', justifyContent: 'space-between' }}>
        {dashed ? (
          <>
            <View style={{ width: 5, height: 2, backgroundColor: style.stroke }} />
            <View style={{ width: 5, height: 2, backgroundColor: style.stroke }} />
            <View style={{ width: 5, height: 2, backgroundColor: style.stroke }} />
          </>
        ) : (
          <View style={{ width: 18, height: Math.max(2, style.width), backgroundColor: style.stroke }} />
        )}
      </View>
      <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>{label}</Text>
    </View>
  );
}
