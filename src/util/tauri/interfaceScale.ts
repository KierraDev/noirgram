export const INTERFACE_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export function getNearestScaleIndex(scale: number) {
  let nearestIndex = 0;
  INTERFACE_SCALES.forEach((step, index) => {
    if (Math.abs(step - scale) < Math.abs(INTERFACE_SCALES[nearestIndex] - scale)) nearestIndex = index;
  });
  return nearestIndex;
}

export async function stepInterfaceScale(direction: 1 | -1) {
  const { interfaceScale } = await window.tauri.getDesktopSettings();
  const index = getNearestScaleIndex(interfaceScale);
  const nextIndex = Math.min(INTERFACE_SCALES.length - 1, Math.max(0, index + direction));
  if (nextIndex === index) return;

  await window.tauri.setInterfaceScale(INTERFACE_SCALES[nextIndex]);
}
