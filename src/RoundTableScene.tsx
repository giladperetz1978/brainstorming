import { useEffect, useEffectEvent, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Camera, Focus, Minus, Pause, Play, Plus, RotateCcw, Scan, Users } from 'lucide-react'

type Participant = { id: string; name: string; role: string; color: string }
type Props = {
  participants: Participant[]
  selectedAgent: string | null
  activeAgent: string | null
  thinking: boolean
  onSelect: (id: string | null) => void
}
type CameraMode = 'orbit' | 'overhead' | 'seat'
type SceneActions = { camera: (mode: CameraMode, id?: string | null) => void; zoom: (factor: number) => void }

export default function RoundTableScene({ participants, selectedAgent, activeAgent, thinking, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<(HTMLButtonElement | null)[]>([])
  const actionsRef = useRef<SceneActions | null>(null)
  const [failed, setFailed] = useState(false)
  const [seats] = useState(participants)
  const [view, setView] = useState<{ mode: CameraMode; autoRotate: boolean; selection: string | null }>(() => ({ mode: 'orbit', autoRotate: !selectedAgent && !window.matchMedia('(prefers-reduced-motion: reduce)').matches, selection: selectedAgent }))
  const mode = view.selection === selectedAgent ? view.mode : 'orbit'
  const autoRotate = view.selection === selectedAgent && view.autoRotate
  const stateRef = useRef({ selectedAgent, activeAgent, thinking, autoRotate })
  const selectParticipant = useEffectEvent((id: string | null) => onSelect(id))
  const reportFailure = useEffectEvent(() => setFailed(true))

  useEffect(() => {
    stateRef.current = { selectedAgent, activeAgent, thinking, autoRotate }
  }, [selectedAgent, activeAgent, thinking, autoRotate])

  useEffect(() => {
    if (selectedAgent) {
      actionsRef.current?.camera('orbit', selectedAgent)
    }
  }, [selectedAgent])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    } catch {
      const failureFrame = requestAnimationFrame(() => reportFailure())
      return () => cancelAnimationFrame(failureFrame)
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    renderer.domElement.setAttribute('aria-label', 'חדר סיעור מוחות בתלת ממד')
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#dce6de')
    scene.fog = new THREE.Fog('#dce6de', 17, 37)
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 70)
    camera.position.set(8.2, 7.5, 10.5)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.8, 0)
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 5.5
    controls.maxDistance = 19
    controls.minPolarAngle = 0.08
    controls.maxPolarAngle = Math.PI / 2.15
    controls.autoRotateSpeed = 0.32
    controls.update()

    scene.add(new THREE.HemisphereLight('#ffffff', '#738477', 2.5))
    const sunlight = new THREE.DirectionalLight('#fff3dc', 4)
    sunlight.position.set(4, 10, 5)
    sunlight.castShadow = true
    sunlight.shadow.mapSize.set(1024, 1024)
    sunlight.shadow.camera.left = -8
    sunlight.shadow.camera.right = 8
    sunlight.shadow.camera.top = 8
    sunlight.shadow.camera.bottom = -8
    sunlight.shadow.normalBias = 0.035
    scene.add(sunlight)
    const rimLight = new THREE.DirectionalLight('#b9efe2', 2)
    rimLight.position.set(-5, 4, -5)
    scene.add(rimLight)

    const materials: THREE.MeshStandardMaterial[] = []
    const material = (color: string, roughness = 0.65, metalness = 0.05) => {
      const result = new THREE.MeshStandardMaterial({ color, roughness, metalness })
      materials.push(result)
      return result
    }
    const stone = material('#edf0e6')
    const graphite = material('#253c36')
    const metal = material('#779a8b', 0.3, 0.6)
    const mint = material('#60d5b1', 0.3, 0.4)
    const white = material('#fff9e8')
    const dark = material('#243431')
    const addMesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, surface: THREE.Material, position: [number, number, number]) => {
      const mesh = new THREE.Mesh(geometry, surface)
      mesh.position.set(...position)
      mesh.castShadow = true
      mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }
    const box = (parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], surface: THREE.Material) =>
      addMesh(parent, new THREE.BoxGeometry(...size), surface, position)
    const cylinder = (parent: THREE.Object3D, top: number, bottom: number, height: number, position: [number, number, number], surface: THREE.Material) =>
      addMesh(parent, new THREE.CylinderGeometry(top, bottom, height, 64), surface, position)
    const sphere = (parent: THREE.Object3D, radius: number, position: [number, number, number], surface: THREE.Material) =>
      addMesh(parent, new THREE.SphereGeometry(radius, 24, 16), surface, position)

    const floor = addMesh(scene, new THREE.PlaneGeometry(200, 200), material('#cbd9ce'), [0, -0.24, 0])
    floor.rotation.x = -Math.PI / 2
    const grid = new THREE.GridHelper(80, 80, '#a3b8ab', '#bacdbf')
    grid.position.y = -0.23
    scene.add(grid)
    cylinder(scene, 4.65, 4.75, 0.2, [0, -0.11, 0], graphite)
    cylinder(scene, 4.6, 4.6, 0.07, [0, 0.025, 0], stone)
    const platformRing = addMesh(scene, new THREE.TorusGeometry(4.36, 0.018, 8, 128), metal, [0, 0.07, 0])
    platformRing.rotation.x = Math.PI / 2

    const glass = material('#c3d6c7', 0.2)
    glass.transparent = true
    glass.opacity = 0.14
    glass.depthWrite = false
    for (let panel = -2; panel <= 2; panel++) {
      const windowPanel = box(scene, [1.6, 3.9, 0.08], [panel * 1.8, 1.8, -5.7], glass)
      windowPanel.castShadow = false
      windowPanel.receiveShadow = false
      box(scene, [0.05, 4.2, 0.15], [panel * 1.8 - 0.87, 1.8, -5.65], white)
    }
    box(scene, [9.1, 0.08, 0.2], [0, 3.9, -5.7], white)
    box(scene, [9.1, 0.08, 0.2], [0, 0, -5.7], white)
    for (const side of [-1, 1]) {
      cylinder(scene, 0.35, 0.26, 0.65, [side * 4.3, 0.18, -3.5], white)
      for (let branch = 0; branch < 5; branch++) {
        const leaf = sphere(scene, 0.3, [side * 4.3 + Math.sin(branch * 2) * 0.2, 0.8 + branch * 0.16, -3.5 + Math.cos(branch * 2) * 0.2], material('#588b66'))
        leaf.scale.set(0.6, 1.9, 0.65)
        leaf.rotation.z = Math.sin(branch) * 0.5
      }
    }

    cylinder(scene, 0.72, 1, 1.1, [0, 0.55, 0], graphite)
    cylinder(scene, 2.18, 2.1, 0.16, [0, 1.16, 0], metal)
    cylinder(scene, 2.17, 2.17, 0.11, [0, 1.28, 0], stone)
    const tableRing = addMesh(scene, new THREE.TorusGeometry(2.12, 0.022, 8, 128), mint, [0, 1.345, 0])
    tableRing.rotation.x = Math.PI / 2
    cylinder(scene, 0.64, 0.7, 0.05, [0, 1.36, 0], graphite)
    const core = addMesh(scene, new THREE.IcosahedronGeometry(0.26, 0), mint, [0, 1.78, 0])
    const coreRing = addMesh(scene, new THREE.TorusGeometry(0.47, 0.015, 8, 64), metal, [0, 1.78, 0])
    coreRing.rotation.x = 1.1

    const figures: { group: THREE.Group; head: THREE.Group; marker: THREE.Mesh; anchor: THREE.Vector3; angle: number }[] = []
    const selectable: THREE.Object3D[] = []
    const skinColors = ['#d8a17d', '#bd8c6c', '#edbe98', '#b78563', '#d9b18e']
    seats.forEach((participant, index) => {
      const angle = Math.PI + index * (Math.PI * 2 / 5)
      const group = new THREE.Group()
      group.position.set(Math.sin(angle) * 2.92, 0.08, Math.cos(angle) * 2.92)
      group.rotation.y = angle + Math.PI
      scene.add(group)
      const outfit = material(participant.color)
      const skin = material(skinColors[index % skinColors.length])
      const hair = material(index === 2 ? '#885941' : '#34352f')
      box(group, [0.82, 0.14, 0.8], [0, 0.65, 0], graphite)
      const chairBack = box(group, [0.85, 0.82, 0.14], [0, 1.05, -0.37], graphite)
      chairBack.rotation.x = -0.12
      for (const side of [-1, 1]) {
        cylinder(group, 0.035, 0.035, 0.62, [side * 0.32, 0.31, -0.23], metal)
        cylinder(group, 0.035, 0.035, 0.62, [side * 0.32, 0.31, 0.26], metal)
        box(group, [0.21, 0.51, 0.22], [side * 0.19, 0.45, 0.26], dark)
        box(group, [0.23, 0.12, 0.38], [side * 0.19, 0.16, 0.35], white)
      }
      const body = cylinder(group, 0.28, 0.36, 0.7, [0, 1.1, 0], outfit)
      body.scale.z = 0.75
      const head = new THREE.Group()
      head.position.set(0, 1.73, 0)
      group.add(head)
      cylinder(head, 0.095, 0.11, 0.17, [0, -0.25, 0], skin)
      const face = sphere(head, 0.27, [0, 0, 0], skin)
      face.scale.set(0.87, 1.1, 0.9)
      const hairCap = sphere(head, 0.275, [0, 0.1, -0.04], hair)
      hairCap.scale.set(0.9, 0.75, 0.9)
      if (index === 0 || index === 2) {
        const longHair = sphere(head, 0.23, [0, -0.1, -0.13], hair)
        longHair.scale.set(1.1, 1.5, 0.7)
      }
      for (const side of [-1, 1]) {
        sphere(head, 0.022, [side * 0.08, 0.005, 0.233], dark)
        sphere(head, 0.05, [side * 0.24, -0.01, 0], skin)
        const arm = cylinder(group, 0.1, 0.095, 0.5, [side * 0.34, 1.04, 0.13], outfit)
        arm.rotation.x = -0.55
        sphere(group, 0.09, [side * 0.34, 0.88, 0.3], skin)
        if (index === 1 || index === 3) {
          const glasses = addMesh(head, new THREE.TorusGeometry(0.071, 0.009, 8, 24), dark, [side * 0.085, 0.02, 0.235])
          glasses.scale.y = 0.85
        }
      }
      sphere(head, 0.034, [0, -0.055, 0.25], skin)
      const marker = addMesh(group, new THREE.TorusGeometry(0.63, 0.025, 8, 64), outfit, [0, 0.01, 0])
      marker.rotation.x = Math.PI / 2
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.userData.participantId = participant.id
          selectable.push(object)
        }
      })
      figures.push({ group, head, marker, anchor: new THREE.Vector3(group.position.x, 2.5, group.position.z), angle })

      const deskItems = new THREE.Group()
      deskItems.position.set(Math.sin(angle) * 1.64, 1.355, Math.cos(angle) * 1.64)
      deskItems.rotation.y = angle
      scene.add(deskItems)
      box(deskItems, [0.42, 0.025, 0.3], [-0.08, 0.012, 0], outfit)
      box(deskItems, [0.37, 0.007, 0.26], [-0.08, 0.029, 0], white)
      cylinder(deskItems, 0.075, 0.062, 0.15, [0.3, 0.075, 0], white)
      cylinder(deskItems, 0.06, 0.06, 0.006, [0.3, 0.152, 0], dark)
      if (index === 4) {
        const laptop = box(deskItems, [0.5, 0.33, 0.025], [-0.08, 0.19, -0.15], graphite)
        laptop.rotation.x = -0.2
      }
    })

    let destination: THREE.Vector3 | null = null
    let lookAt = new THREE.Vector3(0, 0.8, 0)
    let currentMode: CameraMode = 'orbit'
    const wideFactor = () => host.clientWidth / host.clientHeight < 1 ? 1.23 : 1
    actionsRef.current = {
      camera: (nextMode, id) => {
        currentMode = nextMode
        const figure = figures[seats.findIndex((participant) => participant.id === id)]
        lookAt = new THREE.Vector3(0, 0.8, 0)
        if (figure) {
          destination = new THREE.Vector3(-Math.sin(figure.angle) * 8, 4.6, -Math.cos(figure.angle) * 8)
          lookAt = new THREE.Vector3(Math.sin(figure.angle) * 0.6, 1.3, Math.cos(figure.angle) * 0.6)
        } else if (nextMode === 'overhead') {
          destination = new THREE.Vector3(0, 13.6 * wideFactor(), 0.6)
        } else if (nextMode === 'seat') {
          const seat = figures[4]
          destination = new THREE.Vector3(Math.sin(seat.angle) * 7, 3.15, Math.cos(seat.angle) * 7)
          lookAt = new THREE.Vector3(0, 1.35, 0)
        } else {
          destination = new THREE.Vector3(8.2, 7.5, 10.5).multiplyScalar(wideFactor())
        }
      },
      zoom: (factor) => {
        const offset = camera.position.clone().sub(controls.target)
        offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance))
        destination = controls.target.clone().add(offset)
        lookAt = controls.target.clone()
      },
    }
    const resize = () => {
      const width = host.clientWidth
      const height = host.clientHeight
      renderer.setSize(width, height)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    camera.position.multiplyScalar(wideFactor())
    if (stateRef.current.selectedAgent) actionsRef.current.camera('orbit', stateRef.current.selectedAgent)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let pointerStart = { x: 0, y: 0 }
    const pointerDown = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY } }
    const pointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6) return
      const bounds = renderer.domElement.getBoundingClientRect()
      pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(selectable)[0]
      if (hit) selectParticipant(hit.object.userData.participantId === 'human' ? null : hit.object.userData.participantId)
    }
    const stopOrbit = () => { destination = null; setView((current) => ({ ...current, autoRotate: false })) }
    const contextLost = (event: Event) => { event.preventDefault(); reportFailure() }
    controls.addEventListener('start', stopOrbit)
    renderer.domElement.addEventListener('pointerdown', pointerDown)
    renderer.domElement.addEventListener('pointerup', pointerUp)
    renderer.domElement.addEventListener('webglcontextlost', contextLost)

    let frame = 0
    let previousTime = performance.now()
    const projected = new THREE.Vector3()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const animate = (time: number) => {
      const delta = Math.min((time - previousTime) / 1000, 0.05)
      previousTime = time
      const state = stateRef.current
      if (destination) {
        const blend = reducedMotion ? 1 : 1 - Math.exp(-delta * 5)
        camera.position.lerp(destination, blend)
        controls.target.lerp(lookAt, blend)
        if (camera.position.distanceTo(destination) < 0.015) destination = null
      }
      controls.autoRotate = state.autoRotate && currentMode === 'orbit' && !destination
      controls.update(delta)
      if (!reducedMotion) {
        core.rotation.y += delta * (state.thinking ? 1.8 : 0.25)
        core.position.y = 1.78 + Math.sin(time * 0.0015) * 0.045
        coreRing.rotation.z += delta * 0.15
      }
      figures.forEach((figure, index) => {
        const participant = seats[index]
        const selected = state.selectedAgent === participant.id
        const active = state.activeAgent === participant.id
        figure.marker.visible = selected || active || state.thinking
        if (!reducedMotion) figure.head.rotation.z = Math.sin(time * 0.0015 + index) * (state.thinking ? 0.045 : 0.015)
        const label = labelsRef.current[index]
        if (label) {
          projected.copy(figure.anchor).project(camera)
          const visible = projected.z < 1 && Math.abs(projected.x) < 0.92 && Math.abs(projected.y) < 0.9
          label.style.visibility = visible ? 'visible' : 'hidden'
          label.style.left = `${(projected.x * 0.5 + 0.5) * host.clientWidth}px`
          label.style.top = `${(-projected.y * 0.5 + 0.5) * host.clientHeight}px`
        }
      })
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.removeEventListener('start', stopOrbit)
      controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', pointerDown)
      renderer.domElement.removeEventListener('pointerup', pointerUp)
      renderer.domElement.removeEventListener('webglcontextlost', contextLost)
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) object.geometry.dispose()
      })
      materials.forEach((surface) => surface.dispose())
      if (Array.isArray(grid.material)) grid.material.forEach((surface) => surface.dispose())
      else grid.material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      actionsRef.current = null
    }
  }, [seats])

  const changeCamera = (nextMode: CameraMode) => {
    setView({ mode: nextMode, autoRotate: false, selection: selectedAgent })
    actionsRef.current?.camera(nextMode)
  }

  return (
    <div className="room-scene">
      <div className="scene-canvas" ref={hostRef} />
      {!failed && <div className="scene-labels">
        {participants.map((participant, index) => <button
          key={participant.id}
          ref={(element) => { labelsRef.current[index] = element }}
          className={`scene-label ${selectedAgent === participant.id ? 'selected' : ''}`}
          style={{ borderColor: participant.color }}
          aria-pressed={selectedAgent === participant.id}
          onClick={() => onSelect(participant.id === 'human' ? null : participant.id)}
        ><span className="participant-dot" style={{ background: participant.color }} /><strong>{participant.name}</strong><small>{participant.role}</small></button>)}
      </div>}
      {failed && <div className="scene-fallback" role="alert"><Camera size={32} /><h2>תצוגת התלת־ממד אינה זמינה</h2><p>אפשר להמשיך בשיחה ובסיעור המוחות.</p><button onClick={() => window.location.reload()}>טעינה מחדש</button></div>}
      <div className="room-coordinate" aria-hidden="true"><span>FUTURE / ROOM 01</span><span>ROUND TABLE SESSION</span></div>
      <div className="camera-toolbar" role="toolbar" aria-label="מצלמה">
        <button title="מבט סביב השולחן" aria-label="מבט סביב השולחן" aria-pressed={mode === 'orbit'} onClick={() => changeCamera('orbit')}><Camera size={18} /></button>
        <button title="מבט על" aria-label="מבט על" aria-pressed={mode === 'overhead'} onClick={() => changeCamera('overhead')}><Scan size={18} /></button>
        <button title="מבט מהמושב שלי" aria-label="מבט מהמושב שלי" aria-pressed={mode === 'seat'} onClick={() => changeCamera('seat')}><Users size={18} /></button>
        <span className="toolbar-divider" />
        <button title={autoRotate ? 'עצירת סיבוב' : 'סיבוב אוטומטי'} aria-label={autoRotate ? 'עצירת סיבוב' : 'סיבוב אוטומטי'} aria-pressed={autoRotate} onClick={() => {
          if (mode !== 'orbit') actionsRef.current?.camera('orbit')
          setView({ mode: 'orbit', autoRotate: !autoRotate, selection: selectedAgent })
        }}>{autoRotate ? <Pause size={18} /> : <Play size={18} />}</button>
        <button title="התקרבות" aria-label="התקרבות" onClick={() => actionsRef.current?.zoom(0.85)}><Plus size={18} /></button>
        <button title="התרחקות" aria-label="התרחקות" onClick={() => actionsRef.current?.zoom(1.18)}><Minus size={18} /></button>
        <button title="איפוס מצלמה" aria-label="איפוס מצלמה" onClick={() => changeCamera('orbit')}><RotateCcw size={17} /></button>
        {selectedAgent && <button title="מיקוד במשתתף" aria-label="מיקוד במשתתף" onClick={() => { setView({ mode: 'orbit', autoRotate: false, selection: selectedAgent }); actionsRef.current?.camera('orbit', selectedAgent) }}><Focus size={18} /></button>}
      </div>
    </div>
  )
}