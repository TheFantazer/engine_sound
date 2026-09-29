import { expect, it } from 'vitest'
import { Dynamics, engineLossTorque } from '../src/core/dynamics'
import { MODELS, TEMPLATES } from '../src/catalog/presets'

const r1 = MODELS.find(model => model.id === 'r1')!.config
it.each([0])('R1 coastdown reaches idle + 50 rpm promptly in gear %i', gear => {
  const d = new Dynamics(); d.reset(r1); d.state.gear = gear
  d.state.rpm = r1.redline; d.state.throttle = 1
  let elapsed = 0
  while (d.state.rpm > r1.idle + 50 && elapsed < 60) { d.tick(1 / 120, r1); elapsed += 1 / 120 }
  console.info(`R1 gear ${gear}: ${elapsed.toFixed(3)} s to idle + 50 rpm`)
  expect(elapsed).toBeLessThan(8)
})

it('losses grow with speed and with throttle closure', () => {
  expect(engineLossTorque(12000, 0, r1)).toBeGreaterThan(engineLossTorque(6000, 0, r1))
  expect(engineLossTorque(6000, 0, r1)).toBeGreaterThan(engineLossTorque(6000, 1, r1))
  expect(engineLossTorque(6000, 0, { ...r1, displacement: r1.displacement * 2 })).toBeCloseTo(engineLossTorque(6000, 0, r1) * 2)
})
it('coastdown retains dependence on engine inertia, independently of rendering frequency', () => {
  const duration = (inertia: number, dt: number) => {
    const c = { ...r1, inertia }; const d = new Dynamics(); d.reset(c); d.state.rpm = 12000
    let t = 0
    while (d.state.rpm > 2000 && t < 30) { d.tick(dt, c); t += dt }
    return t
  }
  const light = duration(0.1, 1 / 120), heavy = duration(0.2, 1 / 120)
  expect(heavy / light).toBeCloseTo(2, 1)
  expect(Math.abs(duration(0.1, 1 / 30) - light)).toBeLessThan(0.05)
})
it.each(TEMPLATES)('$id returns to stable audible idle and can accelerate near redline', ({ config: c }) => {
  const d = new Dynamics(); d.reset(c); d.state.rpm = c.redline; d.state.gear = 0
  for (let i = 0; i < 7200; i++) d.tick(1 / 120, c)
  expect(d.state.rpm).toBeCloseTo(c.idle, 0)
  expect(d.state.load).toBeGreaterThanOrEqual(0.12)
  expect(d.state.fuel).toBe(true)
  d.state.gear = 0; d.gas = 1
  for (let i = 0; i < 3600; i++) d.tick(1 / 120, c)
  expect(d.state.rpm).toBeGreaterThan(c.redline * 0.97)
})
