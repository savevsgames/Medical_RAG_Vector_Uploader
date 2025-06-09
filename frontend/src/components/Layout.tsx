import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  MessageSquare, 
  FileText, 
  Activity, 
  LogOut, 
  User
} from 'lucide-react';

export function Layout() {
  const { user, signOut } = useAuth();

  const navItems = [
    {
      to: '/chat',
      icon: MessageSquare,
      label: 'Agent Chat',
      description: 'Interact with your AI assistant'
    },
    {
      to: '/documents',
      icon: FileText,
      label: 'RAG Documents',
      description: 'Upload and manage documents'
    },
    {
      to: '/monitor',
      icon: Activity,
      label: 'Agent Monitor',
      description: 'Track agent activity and logs'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-blue to-cloud-ivory">
      {/* Header */}
      <header className="bg-cloud-ivory/90 backdrop-blur-sm shadow-mild border-b border-soft-gray/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Title */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10">
                <img 
                  src="/logo_transparent.png" 
                  alt="Symptom Savior Logo" 
                  className="w-10 h-10 object-contain glow-effect"
                />
              </div>
              <div>
                <h1 className="text-xl font-heading font-bold text-deep-midnight">
                  Symptom Savior
                </h1>
                <p className="text-xs text-healing-teal font-subheading">
                  Smart MedDoc Portal
                </p>
              </div>
            </div>

            {/* User Info and Logout */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-3 py-2 bg-cloud-ivory rounded-xl shadow-mild border border-soft-gray/20">
                <User className="w-4 h-4 text-healing-teal" />
                <div className="text-sm">
                  <div className="font-subheading font-medium text-deep-midnight">
                    {user?.email || 'Unknown User'}
                  </div>
                  <div className="text-xs text-soft-gray">
                    Logged in
                  </div>
                </div>
              </div>
              
              <button
                onClick={signOut}
                className="flex items-center space-x-2 px-3 py-2 text-sm font-subheading font-medium text-deep-midnight hover:text-healing-teal hover:bg-cloud-ivory/50 rounded-xl transition-all duration-200"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-cloud-ivory/80 backdrop-blur-sm border-b border-soft-gray/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center space-x-2 py-4 px-1 border-b-2 font-subheading font-medium text-sm transition-all duration-200 ${
                      isActive
                        ? 'border-healing-teal text-healing-teal glow-effect'
                        : 'border-transparent text-deep-midnight/70 hover:text-healing-teal hover:border-healing-teal/50'
                    }`
                  }
                >
                  <Icon className="w-5 h-5" />
                  <div>
                    <div>{item.label}</div>
                    <div className="text-xs opacity-75 font-body">{item.description}</div>
                  </div>
                </NavLink>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}