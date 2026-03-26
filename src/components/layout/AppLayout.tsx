import type { ReactNode } from 'react'

interface AppLayoutProps {
  header: ReactNode
  map: ReactNode
  sidebar: ReactNode
}

export function AppLayout({ header, map, sidebar }: AppLayoutProps) {
  return (
    <>
      {header}
      <div className="flex flex-1 min-h-0">
        <div className="flex-[65] relative">
          {map}
        </div>
        <div className="flex-[35] border-l border-gray-200 bg-white overflow-y-auto">
          {sidebar}
        </div>
      </div>
    </>
  )
}
