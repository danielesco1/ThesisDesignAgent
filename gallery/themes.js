export const THEMES = {
  dark:  { bg:0x1a1a1a, thumbBg:0x111111, edgeColor:0xff00ff, edgeOpacity:0.6, edgeOpacityVol:0.25, planOutline:0xffffff, planFillOpacity:0.22, volumeOpacity:0.95, isLight:false, volumeEdgeColor:0xffffff, volumeEdgeOpacity:0.25 },
  light: { bg:0xffffff, thumbBg:0xffffff, edgeColor:0xff00ff, edgeOpacity:0.85, edgeOpacityVol:0.35, planOutline:0x000000, planFillOpacity:0.3, volumeOpacity:0.98, isLight:true,  volumeEdgeColor:0x000000, volumeEdgeOpacity:0.45 }
};
export const STYLE = { xyScale:0.3, levelRise:3, nodeRadius:0.2, nodeSegs:12, floorIsIndex:false };

export let CURRENT = THEMES.light;

export function setTheme(name="light"){
  CURRENT = THEMES[name] || CURRENT;
  document.body.dataset.theme = CURRENT.isLight ? "light" : "dark";
}
