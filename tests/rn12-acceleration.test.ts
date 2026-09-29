import { expect, it } from 'vitest'
import referenceData from '../src/catalog/references/r1-2004.json'
import { fullThrottleTorque } from '../src/core/vehicle'
import { firingFrequency } from '../src/core/config'
import { Dynamics } from '../src/core/dynamics'
import { MODELS } from '../src/catalog/presets'
const model = MODELS.find(m => m.id === 'r1-2004')!
// User-supplied external benchmark, not a Yamaha-certified test protocol.
// https://ru.accelerationtimes.com/models/yamaha-yzf-r1-rn-12
const reference = [0.3,0.6,0.9,1.2,1.5,1.8,2.2,2.5,2.8,3.2,3.6,4.1,4.6,5.1,5.6,6.1,6.6,7,7.3,7.6]
function accelerate(initialRpm: number, dt = 1/240) {
  const d = new Dynamics(); d.vehicle = model.vehicle!; d.reset(model.config)
  d.state.rpm = initialRpm; d.gas = 1
  d.shift(1, model.config)
  const times: number[] = []; let near3750 = 0
  for (let t=0;t<15;t+=dt) {
    if(d.state.rpm>model.config.redline*.98) d.shift(1,model.config)
    d.tick(dt,model.config)
    if (d.state.rpm>3650 && d.state.rpm<3850) near3750+=dt
    while(times.length<20 && d.state.speed*3.6 >= (times.length+1)*10) times.push(t+dt)
    if(times.length===20) break
  }
  return { times, near3750 }
}
it('distinguishes RN12 even firing and gearbox from the later crossplane model', () => {
  expect(model.config.firing).toBe('even')
  expect(MODELS.find(m=>m.id==='r1')!.config.firing).toBe('crossplane')
  expect(model.vehicle!.ratios[1]).toBeCloseTo(38/15)
})
it('does not pin launch to 3750 RPM or erase neutral pre-rev momentum', () => {
  const d = new Dynamics(); d.vehicle=model.vehicle!; d.reset(model.config); d.state.rpm=7500
  d.shift(1,model.config)
  expect(d.state.rpm).toBe(7500); expect(d.state.speed).toBe(0)
  const idle = accelerate(model.config.idle)
  expect(idle.near3750).toBeLessThan(0.6)
  expect(idle.times).toHaveLength(20)
  expect(idle.times[9]).toBeLessThan(5.2)
})
it('benchmarks all 20 checkpoints with an explicit pre-revved launch and automated shifts', () => {
  const { times } = accelerate(7500)
  expect(times).toHaveLength(20)
  times.forEach((time,i) => expect(Math.abs(time-reference[i]), `${(i+1)*10} km/h`).toBeLessThan(1.1))
  expect(Math.abs(times[9]-3.2)).toBeLessThan(0.35)
  // Torque-managed launch removes the old redline slip energy advantage.
  // Keep the external target unchanged and expose the remaining model error.
  expect(Math.abs(times[19]-7.6)).toBeLessThan(0.75)
  console.info('RN12 prepared launch: ' + times.map((t,i)=>`${(i+1)*10}: ${t.toFixed(3)}s`).join(', '))
})
it('keeps acceleration timing consistent at different UI frame rates', () => {
  const slow = accelerate(7500,1/30).times, fast=accelerate(7500).times
  expect(slow).toHaveLength(20)
  slow.forEach((t,i)=>expect(Math.abs(t-fast[i])).toBeLessThan(0.15))
})

it.each(['r1-2004', 'r1'])('quickshifts an early launch with continuously held throttle: %s', id => {
  const m=MODELS.find(m=>m.id===id)!
  const d=new Dynamics(); d.vehicle=m.vehicle; d.reset(m.config)
  d.state.rpm=7000; d.state.throttle=1; d.gas=1
  d.shift(1,m.config)
  for(let i=0;i<60;i++) d.tick(1/240,m.config)
  const before=d.state.rpm, speed=d.state.speed
  expect(d.shift(1,m.config)).toBe(true)
  expect(d.state.gear).toBe(2); expect(d.state.rpm).toBe(before)
  for(let i=0;i<240*3;i++) {
    d.tick(1/240,m.config)
    expect(Number.isFinite(d.state.rpm)).toBe(true)
    expect(d.state.rpm).toBeGreaterThanOrEqual(m.config.idle)
  }
  expect(d.state.speed).toBeGreaterThan(speed+5)
  expect(d.state.gear).toBe(2); expect(d.gas).toBe(1)
})

it('reproduces published stock rear-wheel dyno power without double-counting drivetrain loss', () => {
  const v=model.vehicle
  for(const [rpm,hp] of referenceData.dyno.points) {
    const crankTorque=fullThrottleTorque(rpm,model.config.displacement,model.config.redline,v)
    const wheelHp=crankTorque*rpm*Math.PI/30*v.efficiency/745.6998715822702
    expect(wheelHp).toBeCloseTo(hp,4)
  }
  expect(v.mass).toBe(referenceData.manual.wetMassKg+referenceData.manual.riderMassKgAssumed)
  expect(model.config.idle).toBe(1200)
  expect(firingFrequency(model.config.idle,model.config)).toBe(40)
})
