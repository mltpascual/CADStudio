import { CADProvider, useCAD } from "@/contexts/CADContext";
import MenuBar from "@/components/MenuBar";
import Toolbar from "@/components/Toolbar";
import CADCanvas from "@/components/CADCanvas";
import LayersPanel from "@/components/LayersPanel";
import PropertiesPanel from "@/components/PropertiesPanel";
import CommandLine from "@/components/CommandLine";
import StatusBar from "@/components/StatusBar";

function CADWorkspace() {
  const { state } = useCAD();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground">
      <MenuBar />
      <div className="flex flex-1 overflow-hidden">
        <Toolbar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <CADCanvas />
            {state.showProperties && <PropertiesPanel />}
          </div>
          {state.showCommandLine && <CommandLine />}
        </div>
        {state.showLayers && <LayersPanel />}
      </div>
      <StatusBar />
    </div>
  );
}

export default function Home() {
  return (
    <CADProvider>
      <CADWorkspace />
    </CADProvider>
  );
}
