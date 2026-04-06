import Sidebar from './Sidebar';

export default function MainLayout({ children }) {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 ml-60 overflow-y-auto">
        <div className="p-6 min-h-full">{children}</div>
      </main>
    </div>
  );
}
