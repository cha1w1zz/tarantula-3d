# Runs by itself every time this project opens in the Unreal Editor.
# 1) starts the Unreal MCP server so Claude Code can drive the editor (no console command needed)
# 2) first time only: imports tarantula-scene.glb (from the game's 📦 button) if it is in Downloads
import os
import unreal

_t = [0.0]
_h = [None]


def _start(dt):
    _t[0] += dt
    if _t[0] < 5.0:          # give the editor a few seconds to finish loading plugins
        return
    unreal.unregister_slate_post_tick_callback(_h[0])
    unreal.SystemLibrary.execute_console_command(None, "ModelContextProtocol.StartServer")
    unreal.log("Tarantula: Unreal MCP server started (http://127.0.0.1:8000/mcp)")
    glb = os.path.join(os.path.expanduser("~"), "Downloads", "tarantula-scene.glb")
    if os.path.isfile(glb) and not unreal.EditorAssetLibrary.does_directory_exist("/Game/Tarantula"):
        proj = os.path.normpath(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
        script = os.path.join(os.path.dirname(proj), "import_tarantula.py")
        if os.path.isfile(script):
            unreal.log("Tarantula: importing " + glb)
            exec(open(script, encoding="utf-8").read(), {"__file__": script, "__name__": "__main__"})


_h[0] = unreal.register_slate_post_tick_callback(_start)
