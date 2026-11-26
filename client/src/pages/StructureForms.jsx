import EntityForm from '../components/EntityForm.jsx';
import { classBody } from '../components/ClassPicker.jsx';
import { numOrNull } from '../components/forms.jsx';

export const CourseForm = () => (
  <EntityForm
    noun="course" base="/structure/courses" listPath="/courses" backLabel="courses"
    blank={{ code: '', name: '', semesters: '8' }}
    fields={[
      { key: 'code', label: 'Course code', upper: true, hint: 'Short code such as BTECH. Used in student emails.' },
      { key: 'name', label: 'Course name' },
      { key: 'semesters', label: 'Total semesters', type: 'number', min: 1, max: 12, hint: 'BTECH 8, BBA 6, BCA 6, MBA 4, Diploma 6, ITI 4. Years = semesters ÷ 2.' },
    ]}
    fromItem={(i) => ({ code: i.code, name: i.name, semesters: String(i.semesters) })}
    toBody={(f) => ({ code: f.code, name: f.name, semesters: Number(f.semesters) })}
  />
);

export const DepartmentForm = () => (
  <EntityForm
    noun="department" base="/structure/departments" listPath="/departments" backLabel="departments"
    blank={{ courseId: '', code: '', name: '', semesters: '' }}
    fields={[
      { key: 'courseId', label: 'Course', type: 'select', disabledWhenEditing: true, options: (_f, m) => m.courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })) },
      { key: 'code', label: 'Department code', upper: true, hint: 'Like CSE, ME, EE, CE, or an ITI trade such as FITTER.' },
      { key: 'name', label: 'Department name' },
      { key: 'semesters', label: 'Semesters (optional)', type: 'number', min: 1, max: 12, hint: "Leave empty to use the course's semesters. Use it for a trade with a shorter duration." },
    ]}
    toBody={(f) => ({ courseId: Number(f.courseId) || undefined, code: f.code, name: f.name, semesters: numOrNull(f.semesters) })}
  />
);

export const SubjectForm = () => (
  <EntityForm
    noun="subject" base="/structure/subjects" listPath="/subjects" backLabel="subjects"
    blank={{ code: '', name: '', credits: '4', courseId: '', departmentId: '', semester: '' }}
    fields={[
      { key: 'code', label: 'Subject code', upper: true },
      { key: 'name', label: 'Subject name' },
      { key: 'credits', label: 'Credits', type: 'number', min: 1, max: 10 },
      { key: 'class', type: 'class' },
    ]}
    fromItem={(i) => ({ ...i, credits: String(i.credits) })}
    toBody={(f) => ({ code: f.code, name: f.name, credits: Number(f.credits), ...classBody(f) })}
  />
);

export const NoticeForm = () => (
  <EntityForm
    noun="notice" base="/notices" listPath="/notices" backLabel="notices"
    blank={{ title: '', body: '', audience: 'ALL', courseId: '' }}
    fields={[
      { key: 'title', label: 'Title', wide: true },
      { key: 'audience', label: 'Who should see it', type: 'select', options: () => [{ value: 'ALL', label: 'Everyone' }, { value: 'STUDENT', label: 'Students' }, { value: 'TEACHER', label: 'Faculty' }] },
      { key: 'courseId', label: 'Only one course (optional)', type: 'select', empty: 'All courses', options: (_f, m) => m.courses.map((c) => ({ value: c.id, label: c.code })), show: (f) => f.audience !== 'TEACHER' },
      { key: 'body', label: 'Notice', type: 'textarea', rows: 8, wide: true },
    ]}
    toBody={(f) => ({ title: f.title, body: f.body, audience: f.audience, courseId: f.audience === 'TEACHER' ? null : numOrNull(f.courseId) })}
  />
);
