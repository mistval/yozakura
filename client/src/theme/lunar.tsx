export default function LunarBackground() {
  return (
    <svg
      viewBox="-3200 -3200 6400 6400"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="lunar-svg"
    >
      <defs>
        <filter id="moonGlow" x="-200%" y="-200%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="25" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="starGlow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <style>{`
          .moonCore   { fill: #F4F1E8; }
          .craterDark { fill: #D9D5CB; opacity: 0.65; }
          .craterLite { fill: #FFFFFF; opacity: 0.22; }
          .sW { fill: #FFFFFF; }
          .sB { fill: #B9D9FF; }
          .sP { fill: #D7B8FF; }
          .sG { fill: #FFE7A3; }
        `}</style>
      </defs>

      <g filter="url(#starGlow)">
        {/* ── original near-moon stars (top-right quadrant) ── */}
        <circle className="sW" cx="180" cy="-640" r="3" />
        <circle className="sB" cx="420" cy="-710" r="4" />
        <circle className="sP" cx="650" cy="-610" r="4" />
        <circle className="sG" cx="120" cy="-280" r="3" />
        <circle className="sW" cx="350" cy="-340" r="4" />
        <circle className="sB" cx="620" cy="-250" r="3" />
        <circle className="sG" cx="30" cy="-120" r="3" />
        <circle className="sW" cx="340" cy="-80" r="4" />
        <circle className="sB" cx="610" cy="-140" r="3" />
        <g transform="translate(500,-420)">
          <polygon className="sB" points="0,-28 6,-6 28,0 6,6 0,28 -6,6 -28,0 -6,-6" />
        </g>
        <g transform="translate(0,-620)">
          <polygon className="sG" points="0,-20 4,-4 20,0 4,4 0,20 -4,4 -20,0 -4,-4" />
        </g>

        {/* ── x:0→800, y:-800→0 ── */}
        <circle className="sW" cx="90" cy="-755" r="2.5" />
        <circle className="sB" cx="230" cy="-520" r="3" />
        <circle className="sP" cx="470" cy="-480" r="2" />
        <circle className="sG" cx="560" cy="-760" r="2.5" />
        <circle className="sW" cx="710" cy="-390" r="3" />
        <circle className="sB" cx="780" cy="-168" r="2" />
        <circle className="sG" cx="50" cy="-460" r="2" />
        <circle className="sP" cx="300" cy="-200" r="2.5" />
        <circle className="sW" cx="640" cy="-55" r="2" />
        <circle className="sB" cx="190" cy="-92" r="3" />

        {/* ── x:800→1600, y:-800→0 ── */}
        <circle className="sW" cx="840" cy="-740" r="3" />
        <circle className="sB" cx="950" cy="-580" r="4" />
        <circle className="sP" cx="1080" cy="-690" r="2.5" />
        <circle className="sG" cx="1200" cy="-520" r="3" />
        <circle className="sW" cx="1340" cy="-620" r="2" />
        <circle className="sB" cx="1480" cy="-440" r="3.5" />
        <circle className="sP" cx="1560" cy="-730" r="2" />
        <circle className="sG" cx="870" cy="-320" r="3" />
        <circle className="sW" cx="1000" cy="-180" r="2.5" />
        <circle className="sB" cx="1150" cy="-280" r="2" />
        <circle className="sP" cx="1300" cy="-100" r="3" />
        <circle className="sG" cx="1450" cy="-200" r="2.5" />
        <circle className="sW" cx="1550" cy="-50" r="2" />
        <circle className="sB" cx="920" cy="-50" r="3" />
        <circle className="sW" cx="1220" cy="-440" r="2" />
        <circle className="sP" cx="1380" cy="-360" r="3" />
        <g transform="translate(1100,-650)">
          <polygon className="sG" points="0,-18 4,-4 18,0 4,4 0,18 -4,4 -18,0 -4,-4" />
        </g>
        <g transform="translate(1500,-300)">
          <polygon className="sW" points="0,-22 5,-5 22,0 5,5 0,22 -5,5 -22,0 -5,-5" />
        </g>

        {/* ── x:1600→2400, y:-800→0 ── */}
        <circle className="sW" cx="1620" cy="-760" r="3" />
        <circle className="sB" cx="1750" cy="-600" r="4" />
        <circle className="sP" cx="1900" cy="-700" r="2.5" />
        <circle className="sG" cx="2050" cy="-550" r="3" />
        <circle className="sW" cx="2180" cy="-650" r="2" />
        <circle className="sB" cx="2300" cy="-480" r="3.5" />
        <circle className="sP" cx="2380" cy="-740" r="2" />
        <circle className="sG" cx="1680" cy="-340" r="3" />
        <circle className="sW" cx="1820" cy="-200" r="2.5" />
        <circle className="sB" cx="1970" cy="-300" r="2" />
        <circle className="sP" cx="2100" cy="-120" r="3" />
        <circle className="sG" cx="2250" cy="-220" r="2.5" />
        <circle className="sW" cx="2360" cy="-60" r="2" />
        <circle className="sB" cx="1700" cy="-80" r="3" />
        <circle className="sW" cx="2000" cy="-460" r="2" />
        <circle className="sP" cx="2150" cy="-380" r="3" />
        <g transform="translate(1850,-680)">
          <polygon className="sB" points="0,-20 4,-4 20,0 4,4 0,20 -4,4 -20,0 -4,-4" />
        </g>
        <g transform="translate(2300,-150)">
          <polygon className="sP" points="0,-16 3,-3 16,0 3,3 0,16 -3,3 -16,0 -3,-3" />
        </g>

        {/* ── x:2400→3200, y:-800→0 ── */}
        <circle className="sW" cx="2420" cy="-740" r="3" />
        <circle className="sB" cx="2560" cy="-590" r="4" />
        <circle className="sP" cx="2700" cy="-680" r="2.5" />
        <circle className="sG" cx="2840" cy="-540" r="3" />
        <circle className="sW" cx="2980" cy="-640" r="2" />
        <circle className="sB" cx="3100" cy="-470" r="3.5" />
        <circle className="sP" cx="3180" cy="-750" r="2" />
        <circle className="sG" cx="2480" cy="-330" r="3" />
        <circle className="sW" cx="2620" cy="-190" r="2.5" />
        <circle className="sB" cx="2770" cy="-290" r="2" />
        <circle className="sP" cx="2900" cy="-110" r="3" />
        <circle className="sG" cx="3050" cy="-210" r="2.5" />
        <circle className="sW" cx="3160" cy="-55" r="2" />
        <circle className="sB" cx="2500" cy="-75" r="3" />
        <circle className="sW" cx="2800" cy="-450" r="2" />
        <circle className="sP" cx="2950" cy="-370" r="3" />
        <g transform="translate(2650,-700)">
          <polygon className="sG" points="0,-22 5,-5 22,0 5,5 0,22 -5,5 -22,0 -5,-5" />
        </g>
        <g transform="translate(3100,-280)">
          <polygon className="sW" points="0,-18 4,-4 18,0 4,4 0,18 -4,4 -18,0 -4,-4" />
        </g>

        {/* ── x:0→800, y:-1600→-800 ── */}
        <circle className="sW" cx="60" cy="-880" r="2.5" />
        <circle className="sB" cx="180" cy="-980" r="3.5" />
        <circle className="sP" cx="310" cy="-860" r="2" />
        <circle className="sG" cx="440" cy="-1050" r="3" />
        <circle className="sW" cx="580" cy="-920" r="2.5" />
        <circle className="sB" cx="700" cy="-1100" r="2" />
        <circle className="sP" cx="780" cy="-850" r="3" />
        <circle className="sG" cx="100" cy="-1200" r="2.5" />
        <circle className="sW" cx="250" cy="-1380" r="3" />
        <circle className="sB" cx="400" cy="-1280" r="2" />
        <circle className="sP" cx="550" cy="-1450" r="3.5" />
        <circle className="sG" cx="680" cy="-1320" r="2" />
        <circle className="sW" cx="760" cy="-1580" r="3" />
        <circle className="sB" cx="130" cy="-1500" r="2.5" />
        <circle className="sP" cx="340" cy="-1160" r="2" />
        <circle className="sW" cx="510" cy="-1080" r="3" />
        <g transform="translate(200,-1420)">
          <polygon className="sG" points="0,-20 4,-4 20,0 4,4 0,20 -4,4 -20,0 -4,-4" />
        </g>
        <g transform="translate(640,-970)">
          <polygon className="sB" points="0,-16 3,-3 16,0 3,3 0,16 -3,3 -16,0 -3,-3" />
        </g>

        {/* ── x:800→1600, y:-1600→-800 ── */}
        <circle className="sW" cx="860" cy="-870" r="3" />
        <circle className="sB" cx="990" cy="-1020" r="4" />
        <circle className="sP" cx="1130" cy="-900" r="2.5" />
        <circle className="sG" cx="1260" cy="-1080" r="3" />
        <circle className="sW" cx="1400" cy="-940" r="2" />
        <circle className="sB" cx="1530" cy="-1130" r="3.5" />
        <circle className="sP" cx="820" cy="-1200" r="2" />
        <circle className="sG" cx="950" cy="-1350" r="3" />
        <circle className="sW" cx="1100" cy="-1250" r="2.5" />
        <circle className="sB" cx="1240" cy="-1420" r="2" />
        <circle className="sP" cx="1380" cy="-1300" r="3" />
        <circle className="sG" cx="1510" cy="-1480" r="2.5" />
        <circle className="sW" cx="880" cy="-1560" r="2" />
        <circle className="sB" cx="1050" cy="-1150" r="3" />
        <circle className="sP" cx="1320" cy="-1060" r="2" />
        <g transform="translate(1450,-1380)">
          <polygon className="sW" points="0,-24 5,-5 24,0 5,5 0,24 -5,5 -24,0 -5,-5" />
        </g>
        <g transform="translate(950,-870)">
          <polygon className="sP" points="0,-18 4,-4 18,0 4,4 0,18 -4,4 -18,0 -4,-4" />
        </g>

        {/* ── x:1600→2400, y:-1600→-800 ── */}
        <circle className="sW" cx="1640" cy="-860" r="3" />
        <circle className="sB" cx="1780" cy="-1010" r="4" />
        <circle className="sP" cx="1920" cy="-890" r="2.5" />
        <circle className="sG" cx="2060" cy="-1070" r="3" />
        <circle className="sW" cx="2190" cy="-930" r="2" />
        <circle className="sB" cx="2320" cy="-1120" r="3.5" />
        <circle className="sP" cx="2390" cy="-850" r="2" />
        <circle className="sG" cx="1700" cy="-1190" r="3" />
        <circle className="sW" cx="1840" cy="-1340" r="2.5" />
        <circle className="sB" cx="1990" cy="-1240" r="2" />
        <circle className="sP" cx="2120" cy="-1410" r="3" />
        <circle className="sG" cx="2270" cy="-1290" r="2.5" />
        <circle className="sW" cx="2370" cy="-1470" r="2" />
        <circle className="sB" cx="1720" cy="-1550" r="3" />
        <circle className="sP" cx="2000" cy="-1140" r="2" />
        <g transform="translate(2200,-1360)">
          <polygon className="sG" points="0,-20 4,-4 20,0 4,4 0,20 -4,4 -20,0 -4,-4" />
        </g>
        <g transform="translate(1900,-870)">
          <polygon className="sB" points="0,-16 3,-3 16,0 3,3 0,16 -3,3 -16,0 -3,-3" />
        </g>

        {/* ── x:2400→3200, y:-1600→-800 ── */}
        <circle className="sW" cx="2440" cy="-850" r="3" />
        <circle className="sB" cx="2580" cy="-1000" r="4" />
        <circle className="sP" cx="2720" cy="-880" r="2.5" />
        <circle className="sG" cx="2860" cy="-1060" r="3" />
        <circle className="sW" cx="3000" cy="-920" r="2" />
        <circle className="sB" cx="3120" cy="-1110" r="3.5" />
        <circle className="sP" cx="2500" cy="-1180" r="2" />
        <circle className="sG" cx="2640" cy="-1330" r="3" />
        <circle className="sW" cx="2790" cy="-1230" r="2.5" />
        <circle className="sB" cx="2930" cy="-1400" r="2" />
        <circle className="sP" cx="3060" cy="-1280" r="3" />
        <circle className="sG" cx="3170" cy="-1460" r="2.5" />
        <circle className="sW" cx="2520" cy="-1540" r="2" />
        <circle className="sB" cx="2700" cy="-1140" r="3" />
        <circle className="sP" cx="2960" cy="-1060" r="2" />
        <g transform="translate(3050,-1350)">
          <polygon className="sW" points="0,-22 5,-5 22,0 5,5 0,22 -5,5 -22,0 -5,-5" />
        </g>
        <g transform="translate(2780,-870)">
          <polygon className="sP" points="0,-18 4,-4 18,0 4,4 0,18 -4,4 -18,0 -4,-4" />
        </g>

        {/* ── x:0→800, y:-2400→-1600 ── */}
        <circle className="sW" cx="80" cy="-1650" r="2.5" />
        <circle className="sB" cx="220" cy="-1820" r="3.5" />
        <circle className="sP" cx="360" cy="-1700" r="2" />
        <circle className="sG" cx="490" cy="-1900" r="3" />
        <circle className="sW" cx="630" cy="-1760" r="2.5" />
        <circle className="sB" cx="750" cy="-1950" r="2" />
        <circle className="sP" cx="50" cy="-2050" r="3" />
        <circle className="sG" cx="170" cy="-2180" r="2.5" />
        <circle className="sW" cx="290" cy="-2080" r="3" />
        <circle className="sB" cx="420" cy="-2250" r="2" />
        <circle className="sP" cx="560" cy="-2130" r="3.5" />
        <circle className="sG" cx="690" cy="-2000" r="2" />
        <circle className="sW" cx="780" cy="-2300" r="3" />
        <circle className="sB" cx="130" cy="-2380" r="2.5" />
        <circle className="sP" cx="310" cy="-1960" r="2" />
        <circle className="sW" cx="530" cy="-2320" r="3" />
        <g transform="translate(200,-2200)">
          <polygon className="sG" points="0,-22 5,-5 22,0 5,5 0,22 -5,5 -22,0 -5,-5" />
        </g>

        {/* ── x:800→1600, y:-2400→-1600 ── */}
        <circle className="sW" cx="870" cy="-1660" r="3" />
        <circle className="sB" cx="1010" cy="-1830" r="4" />
        <circle className="sP" cx="1150" cy="-1720" r="2.5" />
        <circle className="sG" cx="1290" cy="-1910" r="3" />
        <circle className="sW" cx="1420" cy="-1780" r="2" />
        <circle className="sB" cx="1550" cy="-1960" r="3.5" />
        <circle className="sP" cx="840" cy="-2060" r="2" />
        <circle className="sG" cx="970" cy="-2190" r="3" />
        <circle className="sW" cx="1120" cy="-2090" r="2.5" />
        <circle className="sB" cx="1260" cy="-2260" r="2" />
        <circle className="sP" cx="1390" cy="-2140" r="3" />
        <circle className="sG" cx="1520" cy="-2010" r="2.5" />
        <circle className="sW" cx="900" cy="-2310" r="2" />
        <circle className="sB" cx="1080" cy="-1970" r="3" />
        <circle className="sP" cx="1340" cy="-2370" r="2" />
        <g transform="translate(1460,-2180)">
          <polygon className="sB" points="0,-20 4,-4 20,0 4,4 0,20 -4,4 -20,0 -4,-4" />
        </g>

        {/* ── x:1600→2400, y:-2400→-1600 ── */}
        <circle className="sW" cx="1660" cy="-1650" r="3" />
        <circle className="sB" cx="1800" cy="-1820" r="4" />
        <circle className="sP" cx="1940" cy="-1710" r="2.5" />
        <circle className="sG" cx="2080" cy="-1900" r="3" />
        <circle className="sW" cx="2210" cy="-1770" r="2" />
        <circle className="sB" cx="2340" cy="-1950" r="3.5" />
        <circle className="sP" cx="2390" cy="-1660" r="2" />
        <circle className="sG" cx="1720" cy="-2050" r="3" />
        <circle className="sW" cx="1860" cy="-2180" r="2.5" />
        <circle className="sB" cx="2010" cy="-2080" r="2" />
        <circle className="sP" cx="2140" cy="-2250" r="3" />
        <circle className="sG" cx="2290" cy="-2130" r="2.5" />
        <circle className="sW" cx="2370" cy="-2300" r="2" />
        <circle className="sB" cx="1740" cy="-2370" r="3" />
        <circle className="sP" cx="2060" cy="-1960" r="2" />
        <g transform="translate(2220,-2160)">
          <polygon className="sG" points="0,-18 4,-4 18,0 4,4 0,18 -4,4 -18,0 -4,-4" />
        </g>

        {/* ── x:2400→3200, y:-2400→-1600 ── */}
        <circle className="sW" cx="2460" cy="-1640" r="3" />
        <circle className="sB" cx="2600" cy="-1810" r="4" />
        <circle className="sP" cx="2740" cy="-1700" r="2.5" />
        <circle className="sG" cx="2880" cy="-1890" r="3" />
        <circle className="sW" cx="3010" cy="-1760" r="2" />
        <circle className="sB" cx="3140" cy="-1940" r="3.5" />
        <circle className="sP" cx="2420" cy="-2040" r="2" />
        <circle className="sG" cx="2560" cy="-2170" r="3" />
        <circle className="sW" cx="2710" cy="-2070" r="2.5" />
        <circle className="sB" cx="2850" cy="-2240" r="2" />
        <circle className="sP" cx="2980" cy="-2120" r="3" />
        <circle className="sG" cx="3110" cy="-2000" r="2.5" />
        <circle className="sW" cx="2480" cy="-2290" r="2" />
        <circle className="sB" cx="2660" cy="-2360" r="3" />
        <circle className="sP" cx="2940" cy="-1960" r="2" />
        <g transform="translate(3080,-2150)">
          <polygon className="sW" points="0,-24 5,-5 24,0 5,5 0,24 -5,5 -24,0 -5,-5" />
        </g>

        {/* ── x:0→1600, y:-3200→-2400 ── */}
        <circle className="sW" cx="100" cy="-2450" r="2.5" />
        <circle className="sB" cx="280" cy="-2620" r="3.5" />
        <circle className="sP" cx="450" cy="-2510" r="2" />
        <circle className="sG" cx="620" cy="-2700" r="3" />
        <circle className="sW" cx="790" cy="-2580" r="2.5" />
        <circle className="sB" cx="960" cy="-2750" r="2" />
        <circle className="sP" cx="1130" cy="-2640" r="3" />
        <circle className="sG" cx="1300" cy="-2810" r="2.5" />
        <circle className="sW" cx="1470" cy="-2690" r="3" />
        <circle className="sB" cx="1600" cy="-2540" r="2" />
        <circle className="sP" cx="180" cy="-2850" r="3.5" />
        <circle className="sG" cx="360" cy="-3000" r="2" />
        <circle className="sW" cx="530" cy="-2920" r="3" />
        <circle className="sB" cx="700" cy="-3080" r="2.5" />
        <circle className="sP" cx="870" cy="-2980" r="2" />
        <circle className="sG" cx="1040" cy="-3150" r="3" />
        <circle className="sW" cx="1210" cy="-3050" r="2.5" />
        <circle className="sB" cx="1380" cy="-2920" r="2" />
        <circle className="sP" cx="1550" cy="-3120" r="3" />
        <g transform="translate(650,-2900)">
          <polygon className="sG" points="0,-22 5,-5 22,0 5,5 0,22 -5,5 -22,0 -5,-5" />
        </g>
        <g transform="translate(1200,-2750)">
          <polygon className="sB" points="0,-18 4,-4 18,0 4,4 0,18 -4,4 -18,0 -4,-4" />
        </g>

        {/* ── x:1600→3200, y:-3200→-2400 ── */}
        <circle className="sW" cx="1650" cy="-2460" r="3" />
        <circle className="sB" cx="1830" cy="-2630" r="4" />
        <circle className="sP" cx="2010" cy="-2520" r="2.5" />
        <circle className="sG" cx="2190" cy="-2710" r="3" />
        <circle className="sW" cx="2370" cy="-2590" r="2" />
        <circle className="sB" cx="2550" cy="-2760" r="3.5" />
        <circle className="sP" cx="2730" cy="-2650" r="2" />
        <circle className="sG" cx="2910" cy="-2820" r="3" />
        <circle className="sW" cx="3090" cy="-2700" r="2.5" />
        <circle className="sB" cx="1740" cy="-2870" r="2" />
        <circle className="sP" cx="1920" cy="-3010" r="3" />
        <circle className="sG" cx="2100" cy="-2940" r="2.5" />
        <circle className="sW" cx="2280" cy="-3100" r="2" />
        <circle className="sB" cx="2460" cy="-2990" r="3" />
        <circle className="sP" cx="2640" cy="-3160" r="2.5" />
        <circle className="sG" cx="2820" cy="-3050" r="3" />
        <circle className="sW" cx="3000" cy="-2910" r="2" />
        <circle className="sB" cx="3150" cy="-3130" r="3" />
        <circle className="sP" cx="1800" cy="-3180" r="2.5" />
        <circle className="sG" cx="2000" cy="-2780" r="2" />
        <g transform="translate(2350,-2950)">
          <polygon className="sG" points="0,-24 5,-5 24,0 5,5 0,24 -5,5 -24,0 -5,-5" />
        </g>
        <g transform="translate(2900,-2820)">
          <polygon className="sP" points="0,-20 4,-4 20,0 4,4 0,20 -4,4 -20,0 -4,-4" />
        </g>
        <g transform="translate(1680,-3050)">
          <polygon className="sB" points="0,-18 4,-4 18,0 4,4 0,18 -4,4 -18,0 -4,-4" />
        </g>
      </g>

      {/* Moon */}
      <circle cx="0" cy="0" r="190" fill="#DDE7FF" opacity="0.18" filter="url(#moonGlow)" />
      <circle className="moonCore" cx="0" cy="0" r="160" />
      <circle className="craterDark" cx="-70" cy="-50" r="34" />
      <circle className="craterDark" cx="50" cy="-80" r="28" />
      <circle className="craterDark" cx="80" cy="30" r="42" />
      <circle className="craterDark" cx="-20" cy="70" r="24" />
      <circle className="craterDark" cx="-90" cy="60" r="18" />
      <circle className="craterDark" cx="10" cy="-10" r="20" />
      <circle className="craterLite" cx="-55" cy="-65" r="12" />
      <circle className="craterLite" cx="42" cy="-92" r="10" />
      <circle className="craterLite" cx="68" cy="12" r="16" />
      <circle className="craterLite" cx="-28" cy="58" r="9" />
    </svg>
  );
}
