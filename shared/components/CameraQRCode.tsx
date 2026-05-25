import React from 'react';
import { Text, View, Platform } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const GOLD = '#D4A853';
const HOLE_COUNT = 4;

interface Props {
  value: string;
  shareCode: string;
  qrRef?: React.MutableRefObject<any>;
  size?: number; // camera width, default 220
}

function SprocketHoles({ scale }: { scale: number }) {
  return (
    <View style={{ gap: Math.round(6 * scale) }}>
      {Array.from({ length: HOLE_COUNT }).map((_, i) => (
        <View
          key={i}
          style={{
            width: Math.round(6 * scale),
            height: Math.round(10 * scale),
            borderRadius: Math.round(2 * scale),
            backgroundColor: `rgba(212,168,83,0.30)`,
          }}
        />
      ))}
    </View>
  );
}

export default function CameraQRCode({ value, shareCode, qrRef, size = 220 }: Props) {
  const scale   = size / 220;
  const camH    = Math.round(180 * scale);
  const topBarH = Math.round(32  * scale);
  const botBarH = Math.round(24  * scale);
  const lensD   = Math.round(120 * scale);
  const innerD  = Math.round(108 * scale);
  const qrSize  = Math.round(90  * scale);
  const br      = Math.round(16  * scale);

  return (
    <View style={{ alignItems: 'center' }}>
      {/* ── Camera body ── */}
      <View
        style={{
          width: size,
          height: camH,
          borderRadius: br,
          backgroundColor: '#1A1208',
          borderWidth: 2,
          borderColor: GOLD,
          overflow: 'hidden',
          ...Platform.select({
            ios:     { shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 20 },
            android: { elevation: 8 },
          }),
        }}
      >
        {/* Top bar */}
        <View
          style={{
            height: topBarH,
            backgroundColor: '#0C0904',
            borderBottomWidth: 1,
            borderBottomColor: GOLD,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Math.round(10 * scale),
            justifyContent: 'space-between',
          }}
        >
          {/* Viewfinder */}
          <View style={{ width: Math.round(8 * scale), height: Math.round(8 * scale), borderWidth: 1.5, borderColor: GOLD }} />
          {/* Label */}
          <Text style={{ color: GOLD, fontSize: Math.max(7, Math.round(7 * scale)), letterSpacing: 0.8 }}>
            GUESTFUL CLICKS
          </Text>
          {/* Shutter button */}
          <View style={{ width: Math.round(12 * scale), height: Math.round(12 * scale), borderRadius: Math.round(6 * scale), backgroundColor: GOLD }} />
        </View>

        {/* Middle: sprockets + lens */}
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Math.round(10 * scale),
          }}
        >
          <SprocketHoles scale={scale} />

          {/* Lens */}
          <View
            style={{
              width: lensD,
              height: lensD,
              borderRadius: lensD / 2,
              borderWidth: 3,
              borderColor: GOLD,
              backgroundColor: '#0A0806',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {/* Inner ring */}
            <View
              style={{
                width: innerD,
                height: innerD,
                borderRadius: innerD / 2,
                borderWidth: 2,
                borderColor: 'rgba(212,168,83,0.4)',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <QRCode
                value={value || 'https://guestfulclicks.com'}
                size={qrSize}
                getRef={(c: any) => { if (qrRef) qrRef.current = c; }}
                backgroundColor="#0A0806"
                color={GOLD}
              />
            </View>
          </View>

          <SprocketHoles scale={scale} />
        </View>

        {/* Bottom bar */}
        <View
          style={{
            height: botBarH,
            backgroundColor: '#0C0904',
            borderTopWidth: 1,
            borderTopColor: GOLD,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: GOLD, fontSize: Math.max(7, Math.round(7 * scale)), letterSpacing: 2 }}>
            SCAN TO JOIN
          </Text>
        </View>
      </View>

      {/* Share code */}
      <Text style={{ color: GOLD, fontSize: 14, letterSpacing: 3, marginTop: 14 }}>
        Code: {shareCode}
      </Text>
    </View>
  );
}
