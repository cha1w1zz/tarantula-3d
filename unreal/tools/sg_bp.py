# SG_Tarantula: save slot "tarantula3d" (spider + tank state), written by BP_Keeper every 15 s
target('/Game/Game/SG_Tarantula', '/Script/Engine.SaveGame')
for n, t in [('Span', 'float'), ('Hunger', 'float'), ('Growth', 'float'), ('Stage', 'int'), ('StageT', 'float'), ('Molts', 'int'),
             ('Meals', 'int'), ('Hum', 'float'), ('Hours', 'float'), ('Day', 'int'), ('Species', 'int'), ('SpName', 'string')]:
    var(n, t)
compile()
# saves from before the species card have no Species: default to lividus (2) like the web game
call('editor_toolset.toolsets.object.ObjectTools', 'set_properties', {'instance': {'refPath': '/Game/Game/SG_Tarantula.Default__SG_Tarantula_C'}, 'values': '{"Species": 2}'})
call('editor_toolset.toolsets.asset.AssetTools', 'save_assets', {'asset_paths': ['/Game/Game/SG_Tarantula']})
