/*
  libco backend for Emscripten, built on Emscripten fibers.

  The generic fallback (sjlj.c) switches stacks with sigaltstack + longjmp,
  which WebAssembly cannot do, so cores that run their emulation loop in a
  cothread (mupen64plus, ...) never get to run. Fibers work by unwinding and
  rewinding the wasm stack with Asyncify, so the final link needs
  -s ASYNCIFY (RetroArch's Makefile.emscripten: ASYNC=1).

  license: public domain (like the rest of libco)
*/
#define LIBCO_C
#include <libco.h>
#include <stdlib.h>
#include <emscripten/fiber.h>

/* Space Asyncify uses to save a fiber's call stack while it is switched out. */
#define CO_ASYNCIFY_STACK_SIZE (256 * 1024)

typedef struct
{
   emscripten_fiber_t fiber;
   void (*entry)(void);
   void *c_stack;
   void *asyncify_stack;
} co_fiber_t;

static co_fiber_t co_main;
static char co_main_asyncify_stack[CO_ASYNCIFY_STACK_SIZE];
static co_fiber_t *co_running = NULL;

cothread_t co_active(void)
{
   if (!co_running)
   {
      emscripten_fiber_init_from_current_context(&co_main.fiber,
            co_main_asyncify_stack, sizeof(co_main_asyncify_stack));
      co_running = &co_main;
   }
   return co_running;
}

static void co_trampoline(void *arg)
{
   ((co_fiber_t*)arg)->entry();
   abort(); /* a cothread must never return */
}

cothread_t co_create(unsigned int size, void (*coentry)(void))
{
   co_fiber_t *f;

   co_active();
   if (!(f = (co_fiber_t*)calloc(1, sizeof(*f))))
      return NULL;
   f->entry          = coentry;
   f->c_stack        = malloc(size);
   f->asyncify_stack = malloc(CO_ASYNCIFY_STACK_SIZE);
   if (!f->c_stack || !f->asyncify_stack)
   {
      free(f->c_stack);
      free(f->asyncify_stack);
      free(f);
      return NULL;
   }
   emscripten_fiber_init(&f->fiber, co_trampoline, f,
         f->c_stack, size, f->asyncify_stack, CO_ASYNCIFY_STACK_SIZE);
   return f;
}

void co_delete(cothread_t cothread)
{
   co_fiber_t *f = (co_fiber_t*)cothread;
   if (!f || f == &co_main)
      return;
   free(f->c_stack);
   free(f->asyncify_stack);
   free(f);
}

void co_switch(cothread_t cothread)
{
   co_fiber_t *prev = (co_fiber_t*)co_active();
   co_fiber_t *next = (co_fiber_t*)cothread;
   if (prev == next)
      return;
   co_running = next;
   emscripten_fiber_swap(&prev->fiber, &next->fiber);
}
