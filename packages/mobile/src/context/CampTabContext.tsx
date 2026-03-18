import React, { createContext, useContext, useState, ReactNode } from 'react';

type TabName = 'education' | 'lesson' | 'tasks' | 'schedule' | 'guide' | 'class' | 'room';

interface CampTabContextType {
  activeTab: TabName;
  setActiveTab: (tab: TabName) => void;
}

const CampTabContext = createContext<CampTabContextType>({
  activeTab: 'schedule',
  setActiveTab: () => {},
});

export const useCampTab = () => useContext(CampTabContext);

export const CampTabProvider = ({ children }: { children: ReactNode }) => {
  const [activeTab, setActiveTab] = useState<TabName>('schedule');

  return (
    <CampTabContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </CampTabContext.Provider>
  );
};
