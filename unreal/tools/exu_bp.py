# BP_Exuvia: the cast skin left after a molt (spider.js exuvia(), game.js exuviae): a frozen copy of the spider's body,
# abdomen and leg pose in the pale new-skin colour (kit material Pale = 1), a bit lower. After 3 min (EXU_LIFE) it sinks
# into the soil for 10 s and is removed. BP_Tarantula spawns it at the end of the molt and keeps at most 2.
target('/Game/Spider/BP_Exuvia')
for c in ('Body', 'Abdomen'): comp(c, '/Script/Engine.StaticMeshComponent')
for c in ('Legs', 'LegB', 'LegC', 'LegT', 'Knobs'): comp(c, '/Script/Engine.InstancedStaticMeshComponent')
for n, t in [('Life', 'float'), ('Sink', 'float')]:
    var(n, t)

fn('CopyISM', [('From', '/Script/Engine.InstancedStaticMeshComponent'), ('To', '/Script/Engine.InstancedStaticMeshComponent'), ('N', 'int')])
dsl('CopyISM', '''
(fn CopyISM (From To N)
  (Components|StaticMesh|SetStaticMesh :self To :NewMesh (Class|StaticMeshComponent|GetStaticMesh :self From))
  (Components|InstancedStaticMesh|ClearInstances :self To)
  (Collision|SetCollisionEnabled :self To :NewType "NoCollision")
  (for i (range N)
    (bind (t ok) (Components|InstancedStaticMesh|GetInstanceTransform :self From :InstanceIndex i :bWorldSpace true))
    (Components|InstancedStaticMesh|AddInstance :self To :InstanceTransform t :bWorldSpace true))
  (Rendering|Material|SetScalarParameterValueonMaterials :self To :ParameterName "Pale" :ParameterValue 1.0))
''')

fn('CopyMesh', [('From', '/Script/Engine.StaticMeshComponent'), ('To', '/Script/Engine.StaticMeshComponent')])
dsl('CopyMesh', '''
(fn CopyMesh (From To)
  (Components|StaticMesh|SetStaticMesh :self To :NewMesh (Class|StaticMeshComponent|GetStaticMesh :self From))
  (Transformation|SetWorldTransform :self To :NewTransform (Transformation|GetWorldTransform :self From))
  (Collision|SetCollisionEnabled :self To :NewType "NoCollision")
  (Rendering|Material|SetScalarParameterValueonMaterials :self To :ParameterName "Pale" :ParameterValue 1.0))
''')

fn('Copy', [('S', '/Game/Spider/BP_Tarantula.BP_Tarantula_C')])
dsl('Copy', '''
(fn Copy (S)
  (CopyMesh :From (Class|BPTarantula|GetBody :self S) :To Body)
  (CopyMesh :From (Class|BPTarantula|GetAbdomen :self S) :To Abdomen)
  (CopyISM :From (Class|BPTarantula|GetLegs :self S) :To Legs :N 8)
  (CopyISM :From (Class|BPTarantula|GetLegB :self S) :To LegB :N 8)
  (CopyISM :From (Class|BPTarantula|GetLegC :self S) :To LegC :N 8)
  (CopyISM :From (Class|BPTarantula|GetLegT :self S) :To LegT :N 8)
  (CopyISM :From (Class|BPTarantula|GetKnobs :self S) :To Knobs :N 24)
  (bind sp (Class|BPTarantula|GetSpan :self S))
  (Variables|Default|SetSink (* sp 0.012))
  (Transformation|AddActorWorldOffset :self self :DeltaLocation (Math|Vector|MakeVector 0.0 0.0 (* sp -0.025))))
''')

dsl('EventGraph', '''
(event EventTick (DeltaSeconds)
  (Variables|Default|SetLife (+ Life DeltaSeconds))
  (if (> Life 180.0)
    (Transformation|AddActorWorldOffset :self self :DeltaLocation (Math|Vector|MakeVector 0.0 0.0 (* (* DeltaSeconds Sink) -1.0)))
    (if (> Life 190.0) (Actor|DestroyActor :self self))))
''')
compile()
