// Course > Department (only if the course has one) > Semester [> Section].
// This single component is what keeps BTECH, BBA, BCA, MBA, Diploma and ITI apart:
// a department is asked for only when the chosen course has departments.
export const classBody = (v) => ({
  courseId: v.courseId ? Number(v.courseId) : undefined,
  departmentId: v.departmentId ? Number(v.departmentId) : null,
  semester: v.semester ? Number(v.semester) : undefined,
});

export const classReady = (meta, v) => {
  const c = meta.courses.find((x) => x.id === Number(v.courseId));
  return Boolean(c && v.semester && (!c.departments.length || v.departmentId));
};

export default function ClassPicker({ meta, value, onChange, withSection = false, optional = false, disabled = false }) {
  const course = meta.courses.find((c) => c.id === Number(value.courseId));
  const dept = course?.departments.find((d) => d.id === Number(value.departmentId));
  const needsDept = Boolean(course?.departments.length);
  const max = dept?.semesters ?? course?.semesters ?? 0;
  const set = (patch) => onChange({ ...value, ...patch });
  const semesterOptions = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <>
      <div className="field">
        <label>Course</label>
        <select value={value.courseId ?? ''} disabled={disabled} onChange={(e) => set({ courseId: e.target.value, departmentId: '', semester: '' })}>
          <option value="">{optional ? 'All courses' : 'Choose…'}</option>
          {meta.courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
      </div>
      {needsDept && (
        <div className="field">
          <label>Department</label>
          <select value={value.departmentId ?? ''} disabled={disabled} onChange={(e) => set({ departmentId: e.target.value, semester: '' })}>
            <option value="">{optional ? 'All departments' : 'Choose…'}</option>
            {course.departments.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <label>Semester</label>
        <select value={value.semester ?? ''} disabled={disabled || !course || (needsDept && !dept && !optional)} onChange={(e) => set({ semester: e.target.value })}>
          <option value="">{optional ? 'All semesters' : 'Choose…'}</option>
          {semesterOptions.map((n) => <option key={n} value={n}>Semester {n} (Year {Math.ceil(n / 2)})</option>)}
        </select>
      </div>
      {withSection && (
        <div className="field">
          <label>Section</label>
          <select value={value.section ?? ''} disabled={disabled} onChange={(e) => set({ section: e.target.value })}>
            <option value="">{optional ? 'All sections' : 'Choose…'}</option>
            {meta.sections.map((s) => <option key={s} value={s}>Section {s}</option>)}
          </select>
        </div>
      )}
    </>
  );
}
