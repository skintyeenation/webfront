import React, { useMemo } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Circle, G, Path } from 'react-native-svg';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { hierarchy, tree, HierarchyPointNode } from 'd3-hierarchy';
import { linkVertical } from 'd3-shape';
import { theme } from 'skintyee/styles';
import { DeviceDto, DeviceTrustType } from 'skintyee/services/api/ApiService';
import { deviceIcon } from 'skintyee/components/pages/Devices';
import { complianceState, COMPLIANCE_UI } from 'skintyee/components/pages/device-os';

// ----------------------------------------------------------------------------
// DeviceNetworkMap — a top-down tree of the Entra estate, mirroring the
// ADR-16 hybrid-identity topology:
//
//   Skin Tyee · Entra tenant
//     ├─ On-prem AD — STFN.local   (Hybrid)   ── "Entra Connect sync"
//     ├─ Entra-joined              (AzureAd)
//     └─ Personal / BYOD           (Workplace)
//          └─ <device leaf nodes, colour-coded by compliance>
//
// Layout is delegated to d3-hierarchy (`hierarchy()` + `tree()`): we feed it a
// nested data object and it returns x/y for every node. Connectors are drawn
// with d3-shape's `linkVertical()` (an SVG path generator). We only render —
// no hand-rolled geometry. Tapping a device leaf → DeviceDetail.
// ----------------------------------------------------------------------------

type NodeKind = 'root' | 'group' | 'device';

interface MapNode {
  key: string;
  kind: NodeKind;
  label: string;
  sub?: string;
  linkLabel?: string;        // label drawn on the edge from the parent
  device?: DeviceDto;        // present for kind === 'device'
  children?: MapNode[];
}

interface GroupDef {
  trustType: DeviceTrustType;
  label: string;
  sub: string;
  linkLabel?: string;
}

// Trust-type groups, in display order. Empty ones are dropped before layout.
const GROUPS: GroupDef[] = [
  { trustType: 'Hybrid', label: 'On-prem AD', sub: 'STFN.local', linkLabel: 'Entra Connect sync' },
  { trustType: 'AzureAd', label: 'Entra-joined', sub: '' },
  { trustType: 'Workplace', label: 'Personal / BYOD', sub: '' },
];

// Layout constants (pixels).
const NODE_V_GAP = 130;      // vertical distance between tree depths
const LEAF_W = 150;          // nominal horizontal slot per device leaf
const PAD_X = 24;
const PAD_TOP = 24;
const PAD_BOTTOM = 56;       // room for the legend
const ROOT_R = 26;
const GROUP_R = 22;
const LEAF_R = 20;

interface Props {
  devices: DeviceDto[];
  navigation: any;
}

export default function DeviceNetworkMap({ devices, navigation }: Props) {
  const { laidOut, width, height } = useMemo(() => {
    // 1. Build the nested data the way d3-hierarchy expects.
    const groupNodes: MapNode[] = GROUPS.map((g) => {
      const members = devices.filter((d) => d.trustType === g.trustType);
      return {
        key: `group-${g.trustType}`,
        kind: 'group' as const,
        label: g.label,
        sub: g.sub,
        linkLabel: g.linkLabel,
        children: members.map((d) => ({
          key: `dev-${d.id}`,
          kind: 'device' as const,
          label: d.displayName,
          device: d,
        })),
      };
    }).filter((g) => (g.children?.length ?? 0) > 0); // hide empty groups

    const data: MapNode = {
      key: 'root',
      kind: 'root',
      label: 'Skin Tyee',
      sub: 'Entra tenant',
      children: groupNodes,
    };

    // 2. Lay it out with d3-hierarchy. nodeSize gives a fixed slot per node;
    //    we map d3's (x, y) onto our canvas. tree() returns x across, y = depth.
    const root = hierarchy<MapNode>(data, (n) => n.children);
    const leafCount = Math.max(root.leaves().length, 1);
    const layout = tree<MapNode>().nodeSize([LEAF_W, NODE_V_GAP]);
    layout(root);

    const nodes = root.descendants() as HierarchyPointNode<MapNode>[];

    // d3 centres x on 0 and can go negative — normalise into the canvas.
    const xs = nodes.map((n) => n.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const offsetX = PAD_X - minX;

    const w = Math.max((maxX - minX) + PAD_X * 2, leafCount * 90, 320);
    const maxDepth = Math.max(...nodes.map((n) => n.depth));
    const h = PAD_TOP + maxDepth * NODE_V_GAP + PAD_BOTTOM + 36;

    const place = (n: HierarchyPointNode<MapNode>) => ({
      node: n,
      x: n.x + offsetX,
      y: PAD_TOP + n.y,
    });

    return {
      laidOut: nodes.map(place),
      width: w,
      height: h,
    };
  }, [devices]);

  // d3-shape link generator: produces a smooth vertical SVG path string between
  // a parent (source) and child (target), each {x, y}.
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
    const cs = complianceState(node.data.device?.isCompliant);
    return cs === 'compliant'
      ? theme.colors.success
      : cs === 'noncompliant'
        ? theme.colors.error
        : theme.colors.textDarker;
  };

  return (
    <View style={{ marginTop: 8 }}>
      <ScrollView
        horizontal={width > 360}
        showsHorizontalScrollIndicator
        contentContainerStyle={{ minWidth: width }}
      >
        <ScrollView showsVerticalScrollIndicator contentContainerStyle={{ height }}>
          <View style={{ width, height }}>
            {/* SVG: connectors + node rings/dots (non-interactive backdrop). */}
            <Svg width={width} height={height}>
              <G>
                {laidOut.map((p) => {
                  const parent = p.node.parent;
                  if (!parent) return null;
                  const src = byKey.get(parent.data.key);
                  if (!src) return null;
                  const d = link({
                    source: { x: src.x, y: src.y + radiusFor(src.node.data.kind) },
                    target: { x: p.x, y: p.y - radiusFor(p.node.data.kind) },
                  });
                  return (
                    <Path
                      key={`edge-${p.node.data.key}`}
                      d={d ?? undefined}
                      stroke={theme.colors.secondary}
                      strokeWidth={1.5}
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

            {/* Overlay: icons, labels and tap targets positioned over the SVG.
                RN views are used here so taps work reliably on web + native. */}
            {laidOut.map((p) => {
              const { node } = p;
              const r = radiusFor(node.data.kind);
              const isDevice = node.data.kind === 'device';
              const dimmed = isDevice && node.data.device?.enabled === false;
              const dev = node.data.device;
              const icon = isDevice && dev
                ? deviceIcon(dev.operatingSystem, dev.osVersion)
                : node.data.kind === 'root'
                  ? 'cloud-outline'
                  : 'lan';
              const iconColor =
                node.data.kind === 'root'
                  ? theme.colors.primary
                  : node.data.kind === 'group'
                    ? theme.colors.accent
                    : theme.colors.text;

              const labelTop = p.y + r + 4;

              const content = (
                <>
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
                    <MaterialCommunityIcons name={icon} size={r} color={iconColor} />
                  </View>
                  {/* Label below the node. */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: p.x - LEAF_W / 2,
                      top: labelTop,
                      width: LEAF_W,
                      alignItems: 'center',
                      opacity: dimmed ? 0.5 : 1,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: theme.colors.text,
                        fontSize: node.data.kind === 'device' ? 11 : 12,
                        fontWeight: node.data.kind === 'device' ? '400' : '700',
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
                  </View>
                </>
              );

              if (isDevice && dev) {
                return (
                  <TouchableOpacity
                    key={`hit-${node.data.key}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Device ${dev.displayName}`}
                    activeOpacity={0.6}
                    onPress={() => navigation.navigate('deviceDetail', { id: dev.id })}
                    style={{
                      position: 'absolute',
                      left: p.x - LEAF_W / 2,
                      top: p.y - r,
                      width: LEAF_W,
                      height: r * 2 + 34,
                    }}
                  >
                    {content}
                  </TouchableOpacity>
                );
              }
              return <React.Fragment key={`grp-${node.data.key}`}>{content}</React.Fragment>;
            })}
          </View>
        </ScrollView>
      </ScrollView>

      {/* Legend */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginTop: 10,
          paddingHorizontal: 4,
        }}
      >
        <LegendDot color={theme.colors.success} label={COMPLIANCE_UI.compliant.label} />
        <LegendDot color={theme.colors.error} label={COMPLIANCE_UI.noncompliant.label} />
        <LegendDot color={theme.colors.textDarker} label={COMPLIANCE_UI.unknown.label} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 14, marginTop: 4 }}>
          <MaterialCommunityIcons name="server-network" size={14} color={theme.colors.accent} />
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginLeft: 4 }}>Server</Text>
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
