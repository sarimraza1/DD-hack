export default function Toolbar({ activeTool, setActiveTool, myRole }) {
  const tools = [
    { id: 'select', icon: '↖', tooltip: 'Select & Pan' },
    { id: 'sticky', icon: '📝', tooltip: 'Sticky Note' },
    { id: 'shape', icon: '⬜', tooltip: 'Shape' },
    { id: 'text', icon: 'T', tooltip: 'Text Block' },
    { id: 'draw', icon: '✏️', tooltip: 'Freehand Draw' },
  ];

  const isViewer = myRole === 'viewer';

  return (
    <div className="toolbar">
      {tools.map((tool, i) => (
        <>
          {i === 1 && <div key="div1" className="toolbar-divider" />}
          <button
            key={tool.id}
            id={`tool-${tool.id}`}
            className={`toolbar-btn ${activeTool === tool.id ? 'active' : ''}`}
            onClick={() => setActiveTool(tool.id)}
            data-tooltip={tool.tooltip}
            disabled={isViewer && tool.id !== 'select'}
            style={isViewer && tool.id !== 'select' ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
          >
            {tool.icon}
          </button>
        </>
      ))}
    </div>
  );
}
