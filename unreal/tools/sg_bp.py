# SG_Tarantula: save slot "tarantula3d" (spider + tank state), written by BP_Keeper every 15 s
target('/Game/Game/SG_Tarantula', '/Script/Engine.SaveGame')
for n, t in [('Span', 'float'), ('Hunger', 'float'), ('Growth', 'float'), ('Stage', 'int'), ('StageT', 'float'), ('Molts', 'int'),
             ('Meals', 'int'), ('Hum', 'float'), ('Hours', 'float'), ('Day', 'int')]:
    var(n, t)
compile()
