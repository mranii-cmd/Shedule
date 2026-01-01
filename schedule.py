"""
Schedule Management System
A simple application to manage events and tasks in a schedule.
"""

import json
import os
from datetime import datetime
from typing import List, Optional


class Event:
    """Represents a scheduled event."""
    
    def __init__(self, title: str, date: str, time: str, description: str = ""):
        """
        Initialize an event.
        
        Args:
            title: Event title
            date: Event date in YYYY-MM-DD format
            time: Event time in HH:MM format
            description: Optional event description
        """
        self.title = title
        self.date = date
        self.time = time
        self.description = description
        self.id = None  # Will be set by ScheduleManager
    
    def to_dict(self) -> dict:
        """Convert event to dictionary."""
        return {
            'id': self.id,
            'title': self.title,
            'date': self.date,
            'time': self.time,
            'description': self.description
        }
    
    @staticmethod
    def from_dict(data: dict) -> 'Event':
        """Create event from dictionary."""
        event = Event(
            title=data['title'],
            date=data['date'],
            time=data['time'],
            description=data.get('description', '')
        )
        event.id = data.get('id')
        return event
    
    def __str__(self) -> str:
        """String representation of the event."""
        desc = f" - {self.description}" if self.description else ""
        return f"[{self.id}] {self.title} on {self.date} at {self.time}{desc}"


class ScheduleManager:
    """Manages a collection of events."""
    
    def __init__(self, data_file: str = "schedule_data.json"):
        """
        Initialize the schedule manager.
        
        Args:
            data_file: Path to the JSON file for data persistence
        """
        self.data_file = data_file
        self.events: List[Event] = []
        self.next_id = 1
        self.load_events()
    
    def add_event(self, event: Event) -> Event:
        """
        Add a new event to the schedule.
        
        Args:
            event: Event to add
            
        Returns:
            The added event with assigned ID
        """
        event.id = self.next_id
        self.next_id += 1
        self.events.append(event)
        self.save_events()
        return event
    
    def get_event(self, event_id: int) -> Optional[Event]:
        """
        Get an event by ID.
        
        Args:
            event_id: ID of the event to retrieve
            
        Returns:
            Event if found, None otherwise
        """
        for event in self.events:
            if event.id == event_id:
                return event
        return None
    
    def update_event(self, event_id: int, title: Optional[str] = None,
                    date: Optional[str] = None, time: Optional[str] = None,
                    description: Optional[str] = None) -> bool:
        """
        Update an existing event.
        
        Args:
            event_id: ID of the event to update
            title: New title (optional)
            date: New date (optional)
            time: New time (optional)
            description: New description (optional)
            
        Returns:
            True if event was updated, False if not found
        """
        event = self.get_event(event_id)
        if not event:
            return False
        
        if title is not None:
            event.title = title
        if date is not None:
            event.date = date
        if time is not None:
            event.time = time
        if description is not None:
            event.description = description
        
        self.save_events()
        return True
    
    def delete_event(self, event_id: int) -> bool:
        """
        Delete an event by ID.
        
        Args:
            event_id: ID of the event to delete
            
        Returns:
            True if event was deleted, False if not found
        """
        event = self.get_event(event_id)
        if event:
            self.events.remove(event)
            self.save_events()
            return True
        return False
    
    def list_events(self, date: Optional[str] = None) -> List[Event]:
        """
        List all events, optionally filtered by date.
        
        Args:
            date: Optional date filter in YYYY-MM-DD format
            
        Returns:
            List of events
        """
        if date:
            return [e for e in self.events if e.date == date]
        return sorted(self.events, key=lambda e: (e.date, e.time))
    
    def save_events(self):
        """Save events to JSON file."""
        data = {
            'next_id': self.next_id,
            'events': [event.to_dict() for event in self.events]
        }
        with open(self.data_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    def load_events(self):
        """Load events from JSON file."""
        if os.path.exists(self.data_file):
            try:
                with open(self.data_file, 'r') as f:
                    data = json.load(f)
                    self.next_id = data.get('next_id', 1)
                    self.events = [Event.from_dict(e) for e in data.get('events', [])]
            except (json.JSONDecodeError, KeyError):
                print(f"Warning: Could not load data from {self.data_file}")
                self.events = []
                self.next_id = 1
