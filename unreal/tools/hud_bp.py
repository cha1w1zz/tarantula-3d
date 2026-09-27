# WBP_HUD graph: button OnClicked events -> BP_Keeper functions (Keeper is set by BP_Keeper right after CreateWidget)
target('/Game/Game/WBP_HUD', '/Script/UMG.UserWidget')
objvar('Keeper', '/Game/Game/BP_Keeper.BP_Keeper_C')
U = 'UMGToolSet.UMGToolSet'
BTN = [('BtnCricket', '(Class|BPKeeper|SpawnPrey :self Keeper :Kind 0)'), ('BtnDubia', '(Class|BPKeeper|SpawnPrey :self Keeper :Kind 1)'),
       ('BtnMist', '(Class|BPKeeper|Mist :self Keeper)'), ('BtnFollow', '(Class|BPKeeper|ToggleFollow :self Keeper)'),
       ('BtnSpeed', '(Class|BPKeeper|CycleSpeed :self Keeper)'), ('BtnHelp', '(Class|BPKeeper|ToggleHelp :self Keeper)'),
       ('BtnHuman', '(Class|BPKeeper|StartRound :self Keeper)'),
       ('BtnSp0', '(Class|BPKeeper|PickSpecies :self Keeper :K 0)'), ('BtnSp1', '(Class|BPKeeper|PickSpecies :self Keeper :K 1)'),
       ('BtnSp2', '(Class|BPKeeper|PickSpecies :self Keeper :K 2)'), ('BtnStart', '(Class|BPKeeper|StartGame :self Keeper)'),
       ('BtnSkip', '(Class|BPKeeper|EndIntro :self Keeper)')]
code = ''
for b, act in BTN:
    code += '(event OnClicked(%s)\n  %s)\n' % (b, act)
for b, act in BTN:   # (re)create the bound event nodes; the DSL fills them but cannot create them
    call(U, 'BindToEventProperty', {'widgetBlueprint': BP, 'eventName': 'OnClicked', 'propertyName': b, 'propertyClass': {'refPath': '/Script/UMG.Button'}})
dsl('EventGraph', code, keep=True)
compile()
