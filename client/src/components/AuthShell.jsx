import logo from "../assets/vsgoi.jpeg"
export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="shell">
      <aside className="brand">
        <div className="logo"><span className="logo-mark" aria-hidden="true"><img src={logo} height={50} width={100} alt="" /></span></div>
        <div>
          <h2>Students, faculty, attendance, fees and results in one place.</h2>
          <p>Sign in with the account your administrator created for you.</p>
        </div>
      </aside>
      <main className="main">
        <div className="card">
          <h1>{title}</h1>
          <p className="sub">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
