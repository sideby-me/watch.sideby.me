'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgePlus, Link2, Play, CheckCircle } from 'lucide-react';

interface Step {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    icon: <BadgePlus className="h-8 w-8" />,
    title: 'Create a Room',
    description: 'One click. No sign-up. Just a room that actually works.',
  },
  {
    icon: <Link2 className="h-8 w-8" />,
    title: 'Share the Link',
    description: "Send it however you want. We don't need to know.",
  },
  {
    icon: <Play className="h-8 w-8" />,
    title: 'Watch in Sync',
    description: 'Millisecond-accurate sync. Because "close enough" isn\'t.',
  },
];

/**
 * HowItWorks - 3-step flow shown in split panels
 */
export function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        });
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Cycle through steps when visible
  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setActiveStep(prev => (prev + 1) % steps.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [isVisible]);

  return (
    <section ref={sectionRef} className="relative bg-accent/30 py-32">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="mb-20 text-center">
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-4xl font-bold tracking-tight md:text-5xl">
            Ridiculously simple.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
            Three steps. No degree in network engineering required.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
          {steps.map((step, index) => (
            <StepCard key={index} step={step} index={index} isActive={activeStep === index} isVisible={isVisible} />
          ))}
        </div>

        {/* Connection Line (desktop only) */}
        <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 md:block">
          <svg className="h-1 w-[600px]" viewBox="0 0 600 4" fill="none">
            <line
              x1="0"
              y1="2"
              x2="600"
              y2="2"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="8 8"
              className="text-border"
            />
            <circle cx={activeStep * 300} cy="2" r="6" className="fill-primary transition-all duration-500" />
          </svg>
        </div>
      </div>
    </section>
  );
}

function StepCard({
  step,
  index,
  isActive,
  isVisible,
}: {
  step: Step;
  index: number;
  isActive: boolean;
  isVisible: boolean;
}) {
  return (
    <div
      className={`group relative rounded-2xl border p-8 backdrop-blur-sm transition-all duration-500 ${
        isActive ? 'scale-105 border-primary/50 bg-primary/5' : 'border-border bg-background/50 hover:border-primary/30'
      } `}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? `translateY(0) ${isActive ? 'scale(1.05)' : 'scale(1)'}` : 'translateY(20px)',
        transitionDelay: `${index * 150}ms`,
      }}
    >
      {/* Step Number */}
      <div className="absolute -top-4 left-8 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {index + 1}
      </div>

      {/* Icon */}
      <div
        className={`mb-6 flex h-16 w-16 items-center justify-center rounded-xl transition-colors duration-300 ${isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'} `}
      >
        {step.icon}
      </div>

      {/* Content */}
      <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
      <p className="text-muted-foreground">{step.description}</p>

      {/* Completion checkmark for previous steps */}
      {index < 2 && isActive && (
        <div className="absolute -right-2 -top-2">
          <CheckCircle className="h-6 w-6 text-primary" />
        </div>
      )}
    </div>
  );
}
