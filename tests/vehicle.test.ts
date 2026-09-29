import { describe, expect, it } from 'vitest'
import { Dynamics } from '../src/core/dynamics'
const R1_VEHICLE = MODELS.find(m => m.id === 'r1')!.vehicle
import { MODELS } from '../src/catalog/presets'
const c = MODELS.find(m => m.id === 'r1')!.config
function running(gear = 1, rpm = 7000) {
  const d = new Dynamics(); d.vehicle = R1_VEHICLE; d.reset(c)
  d.state.gear = gear; d.state.rpm = rpm
  d.state.speed = rpm * Math.PI / 30 * d.vehicle.radius / (d.vehicle.ratios[gear] * d.vehicle.primary * d.vehicle.finalDrive)
  return d
}
function advance(d: Dynamics, seconds: number) { for (let i=0;i<Math.round(seconds*240);i++) d.tick(1/240,c) }
describe('vehicle coupling and brakes', () => {
  it('upshift conserves speed while lowering RPM, and prevents overrev downshifts', () => {
    const d = running(1,12000); const speed = d.state.speed
    expect(d.shift(1,c)).toBe(true); expect(d.shift(1,c)).toBe(false)
    advance(d,.2)
    expect(d.state.gear).toBe(2); expect(d.state.speed).toBeLessThanOrEqual(speed)
    expect(d.state.speed).toBeGreaterThan(speed*.98)
    expect(d.state.rpm).toBeGreaterThan(9500); expect(d.state.rpm).toBeLessThan(10200)
    const high = running(6,13500)
    expect(high.shift(-1,c)).toBe(false)
  })
  it('braking reduces speed and coupled RPM faster than coasting', () => {
    const coast = running(3), brake = running(3); brake.brake = 1
    advance(coast,1); advance(brake,1)
    expect(brake.state.speed).toBeLessThan(coast.state.speed-5)
    expect(brake.state.rpm).toBeLessThan(coast.state.rpm)
    advance(brake,20)
    expect(brake.state.speed).toBe(0); expect(brake.state.rpm).toBeCloseTo(c.idle,0)
    expect(brake.state.fuel).toBe(true)
  })
  it('braking in neutral does not brake the crankshaft; fixed RPM ignores brake and gas', () => {
    const a=running(), b=running(); a.state.gear=b.state.gear=0; b.brake=1
    advance(a,1); advance(b,1)
    expect(a.state.rpm).toBeCloseTo(b.state.rpm,6); expect(b.state.speed).toBeLessThan(a.state.speed)
    b.fixedRpm=true; b.targetRpm=4000; b.gas=1; advance(b,1)
    expect(b.state.rpm).toBe(4000); expect(b.shift(1,c)).toBe(false)
  })
  it('launches without teleporting speed, and resets gear/speed/pedals', () => {
    const d=new Dynamics(); d.vehicle=R1_VEHICLE; d.reset(c); d.gas=1
    expect(d.shift(-1,c)).toBe(false); expect(d.shift(1,c)).toBe(true)
    expect(d.state.speed).toBe(0); advance(d,3)
    expect(d.state.speed).toBeGreaterThan(10)
    d.reset(c); expect(d.state.speed).toBe(0); expect(d.state.gear).toBe(0)
    expect(d.gas).toBe(0); expect(d.brake).toBe(0)
  })
  it('upper gears require longer for the same RPM interval under load', () => {
    const time = (gear:number) => {
      const d=running(gear,9000); d.gas=1; let t=0
      while(d.state.rpm<11000 && t<40) { d.tick(1/240,c); t+=1/240 }
      return t
    }
    expect(time(5)).toBeGreaterThan(time(1)*2)
  })
  it('coasting on a gear is slower than free revving at the same RPM', () => {
    const road=running(5,12000), neutral=running(5,12000); neutral.state.gear=0
    advance(road,2); advance(neutral,2)
    expect(road.state.rpm).toBeGreaterThan(neutral.state.rpm+2000)
  })
})

it('accepts an early upshift immediately, with no queued action after the torque cut', () => {
  const d=running(1,2500); d.state.rpm=7000; d.state.throttle=1; d.gas=1
  const speed=d.state.speed
  expect(d.shift(1,c)).toBe(true); expect(d.state.gear).toBe(2)
  expect(d.state.rpm).toBe(7000); expect(d.state.speed).toBe(speed)
  expect(d.shift(1,c)).toBe(false)
  advance(d,.4)
  expect(d.state.gear).toBe(2); expect(d.state.rpm).toBeGreaterThan(c.idle)
  expect(d.shift(1,c)).toBe(true); expect(d.state.gear).toBe(3)
  advance(d,1)
  expect(d.state.gear).toBe(3); expect(d.gas).toBe(1)
})

it.each(['r1-2004', 'r1'])('does not accumulate launch slip across first, second and third: %s', id => {
  const m=MODELS.find(m=>m.id===id)!
  for (const dwell of [.5, 1.2, 2]) {
    const d=new Dynamics(); d.vehicle=m.vehicle; d.reset(m.config)
    d.state.rpm=7000; d.state.throttle=1; d.gas=1
    const step=(seconds:number) => { for(let i=0;i<Math.round(seconds*240);i++) d.tick(1/240,m.config) }
    d.shift(1,m.config)
    step(.3)
    expect(d.state.rpm).toBeLessThan(7000)
    expect(d.state.rpm).toBeGreaterThan(6000)
    step(dwell)
    for (const gear of [2,3]) {
      const before=d.state.rpm, speed=d.state.speed
      expect(d.shift(1,m.config)).toBe(true)
      expect(d.state.gear).toBe(gear)
      expect(d.state.speed).toBe(speed)
      step(.45)
      expect(d.state.rpm).toBeLessThan(before)
      const settled=d.state.rpm
      let minimum=settled
      for(let i=0;i<Math.round(dwell*240);i++) {
        d.tick(1/240,m.config); minimum=Math.min(minimum,d.state.rpm)
      }
      expect(minimum, `${id} gear ${gear}, dwell ${dwell}`).toBeGreaterThan(settled-100)
      expect(d.state.speed).toBeGreaterThan(speed)
    }
  }
})

it.each(['r1-2004', 'r1'])('keeps launch RPM changing with vehicle acceleration: %s', id => {
  const m=MODELS.find(m=>m.id===id)!
  for (const hz of [30,60,240]) {
    const d=new Dynamics(); d.vehicle=m.vehicle; d.reset(m.config)
    d.state.rpm=7000; d.state.throttle=1; d.gas=1; d.shift(1,m.config)
    const step=(seconds:number) => { for(let i=0;i<Math.round(seconds*hz);i++) d.tick(1/hz,m.config) }
    step(.5)
    for(let i=0;i<5;i++) {
      const rpm=d.state.rpm, speed=d.state.speed
      step(.5)
      expect(d.state.rpm, `${id} ${hz} Hz launch interval ${i}`).toBeGreaterThan(rpm+500)
      expect(d.state.speed).toBeGreaterThan(speed)
    }
    step(1) // The faster rising launch target still couples by four seconds.
    const shaft=d.state.speed / m.vehicle.radius * m.vehicle.ratios[1] * m.vehicle.primary * m.vehicle.finalDrive * 30/Math.PI
    expect(Math.abs(d.state.rpm-shaft)).toBeLessThan(100)
  }
})

it.each(['r1-2004', 'r1'])('idle launch has no RPM reversal before limiter, including a delayed throttle: %s', id => {
  const m=MODELS.find(m=>m.id===id)!
  for(const hz of [30,60,240]) for(const wait of [0,1]) {
    const d=new Dynamics(); d.vehicle=m.vehicle; d.reset(m.config); d.shift(1,m.config)
    for(let i=0;i<wait*hz;i++) d.tick(1/hz,m.config)
    d.gas=1
    let previous=d.state.rpm, previousSpeed=d.state.speed, peak=previous, drawdown=0, reached=false
    for(let i=0;i<10*hz;i++) {
      d.tick(1/hz,m.config)
      peak=Math.max(peak,d.state.rpm); drawdown=Math.max(drawdown,peak-d.state.rpm)
      if(d.state.rpm>=m.config.redline*.98) { reached=true; break }
      expect(d.state.rpm, `${id} ${hz}Hz t=${i/hz}`).toBeGreaterThanOrEqual(previous-1)
      expect(d.state.speed).toBeGreaterThanOrEqual(previousSpeed)
      previous=d.state.rpm; previousSpeed=d.state.speed
    }
    expect(reached).toBe(true); expect(drawdown).toBeLessThan(5)
    const shaft=d.state.speed / m.vehicle.radius * m.vehicle.ratios[1] * m.vehicle.primary * m.vehicle.finalDrive * 30/Math.PI
    expect(Math.abs(d.state.rpm-shaft)).toBeLessThan(100)
    expect(d.state.gear).toBe(1); expect(d.gas).toBe(1)
  }
})
