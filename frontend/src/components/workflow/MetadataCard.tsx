type Props = {
  name: string;
  description: string;
  onName: (s: string) => void;
  onDescription: (s: string) => void;
  readOnly: boolean;
};

export default function MetadataCard({
  name,
  description,
  onName,
  onDescription,
  readOnly,
}: Props) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>Details</h2>
      </div>
      <div className="card-body">
        <div className="param-grid">
          <div className="field">
            <label htmlFor="wf-name">
              Name <span className="param-field-required">*</span>
            </label>
            <input
              id="wf-name"
              type="text"
              autoComplete="off"
              value={name}
              onChange={(e) => onName(e.target.value)}
              disabled={readOnly}
              placeholder="e.g. RNA-Seq analysis"
            />
          </div>
          <div className="field">
            <label htmlFor="wf-desc">Description</label>
            <input
              id="wf-desc"
              type="text"
              autoComplete="off"
              value={description}
              onChange={(e) => onDescription(e.target.value)}
              disabled={readOnly}
              placeholder="What does this workflow do?"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
