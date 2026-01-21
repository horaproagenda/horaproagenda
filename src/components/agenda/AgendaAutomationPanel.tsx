import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OccupancyDashboard } from './OccupancyDashboard';
import { GapFinderPanel } from './GapFinderPanel';
import { WaitlistPanel } from './WaitlistPanel';
import { SmartRecurrencePanel } from './SmartRecurrencePanel';
import { Button } from '@/components/ui/button';
import { 
  Target, 
  Zap, 
  Users, 
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WaitlistEntry } from '@/hooks/useWaitlist';

interface AgendaAutomationPanelProps {
  selectedDate: Date;
  onOpenNewAppointment?: (date?: Date, time?: string) => void;
  onScheduleFromWaitlist?: (entry: WaitlistEntry) => void;
  onScheduleFromRecurrence?: (clientId: string, serviceId: string, date: Date) => void;
}

export function AgendaAutomationPanel({
  selectedDate,
  onOpenNewAppointment,
  onScheduleFromWaitlist,
  onScheduleFromRecurrence,
}: AgendaAutomationPanelProps) {
  // Start collapsed by default to not obstruct agenda view
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState('occupancy');

  const handleGapSelect = (gap: { start: Date; professionalId: string }) => {
    const time = gap.start.toTimeString().slice(0, 5);
    onOpenNewAppointment?.(gap.start, time);
  };

  if (isCollapsed) {
    return (
      <div className="w-10 border-l bg-muted/20 flex flex-col items-center py-4 gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setIsCollapsed(false)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-col items-center gap-2 mt-4">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", activeTab === 'occupancy' && "bg-primary/10")}
            onClick={() => { setActiveTab('occupancy'); setIsCollapsed(false); }}
          >
            <Target className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", activeTab === 'gaps' && "bg-primary/10")}
            onClick={() => { setActiveTab('gaps'); setIsCollapsed(false); }}
          >
            <Zap className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", activeTab === 'waitlist' && "bg-primary/10")}
            onClick={() => { setActiveTab('waitlist'); setIsCollapsed(false); }}
          >
            <Users className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", activeTab === 'recurrence' && "bg-primary/10")}
            onClick={() => { setActiveTab('recurrence'); setIsCollapsed(false); }}
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 border-l bg-muted/10 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Automações</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setIsCollapsed(true)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-4 m-2">
          <TabsTrigger value="occupancy" className="text-xs px-2">
            <Target className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger value="gaps" className="text-xs px-2">
            <Zap className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger value="waitlist" className="text-xs px-2">
            <Users className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger value="recurrence" className="text-xs px-2">
            <Sparkles className="h-3.5 w-3.5" />
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto p-2">
          <TabsContent value="occupancy" className="m-0">
            <OccupancyDashboard selectedDate={selectedDate} />
          </TabsContent>

          <TabsContent value="gaps" className="m-0">
            <GapFinderPanel 
              selectedDate={selectedDate}
              onSelectGap={handleGapSelect}
            />
          </TabsContent>

          <TabsContent value="waitlist" className="m-0">
            <WaitlistPanel 
              onScheduleFromWaitlist={onScheduleFromWaitlist}
            />
          </TabsContent>

          <TabsContent value="recurrence" className="m-0">
            <SmartRecurrencePanel 
              onScheduleClient={onScheduleFromRecurrence}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
